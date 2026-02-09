# Phase 12: Circuit Breaker - Research

**Researched:** 2026-02-08
**Domain:** API resilience / fault-tolerance in Chrome MV3 service workers
**Confidence:** HIGH

## Summary

The circuit breaker pattern is a well-understood fault-tolerance mechanism that prevents an application from repeatedly calling an API that is failing, giving the service time to recover. This phase wraps the existing API calls in the extension (LLM streaming via OpenAI/OpenRouter, and ElevenLabs STT token requests) with a state machine that transitions through CLOSED (normal), OPEN (rejecting calls), and HALF_OPEN (testing recovery) states.

The primary challenge in this codebase is **not** the circuit breaker logic itself -- it is roughly 100-120 lines of straightforward TypeScript. The challenge is making the state survive Chrome MV3 service worker termination, since all in-memory state (module-scope variables, class instances, Maps) is destroyed when the worker terminates after ~30 seconds of inactivity. The solution is to persist circuit breaker state to `chrome.storage.session` (in-memory, cleared on browser close -- appropriate for transient reliability state) and to use `chrome.alarms` for the OPEN-to-HALF_OPEN recovery timeout instead of `setTimeout` (alarms survive service worker termination and wake the worker).

The existing codebase already has retry logic (`streamWithRetry()` in `background.ts` lines 198-242 with 3 retries and exponential backoff) and connection state broadcasting (`CONNECTION_STATE` messages displayed via `HealthIndicator` component). The circuit breaker wraps *around* the existing retry -- if the circuit is OPEN, it short-circuits before any retries are attempted. The existing `HealthIndicator` UI component already supports `'warning' | 'error' | 'reconnecting'` states and is the natural place to surface "Service unavailable" indicators.

**Primary recommendation:** Hand-roll a ~120-line `CircuitBreaker` class with `chrome.storage.session` persistence and `chrome.alarms`-based recovery timeout. Create per-service instances (one per API provider). No external dependencies needed. Integrate at the `streamWithRetry()` layer for LLM and at the `obtainToken()` layer for ElevenLabs.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `chrome.storage.session` | Chrome 102+ (10MB from 112+) | Persist circuit breaker state across SW restarts | In-memory, no disk I/O, cleared on browser close (appropriate lifecycle), native Chrome API |
| `chrome.alarms` | Chrome MV3 | OPEN-to-HALF_OPEN recovery timeout | Survives service worker termination, wakes worker automatically, minimum 30s interval (Chrome 120+) |
| TypeScript strict mode | 5.4+ | Circuit breaker class and types | Already in project |

### Supporting

No additional libraries needed. Everything uses native Chrome APIs and existing project infrastructure.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom ~120-line class | [Opossum](https://github.com/nodeshift/opossum) 9.x | 15KB+ bundle, Node.js-focused, uncertain service worker compatibility, event emitter/metrics/fallback features we don't need. Our use case is 3 states + 2 counters -- far too simple for a library |
| `chrome.storage.session` | `chrome.storage.local` | Local persists across browser restarts, which is wrong for circuit breaker (stale OPEN state after days-old browser crash). Session has correct lifecycle. |
| `chrome.alarms` | `setTimeout` | setTimeout dies when service worker terminates. The recovery timeout would never fire, leaving circuit permanently OPEN until browser restart. |
| Per-provider instances | Single global circuit breaker | Different providers fail independently. OpenAI could be down while OpenRouter works. Per-provider gives correct isolation. |

**Installation:**
```bash
# No new packages needed. Only manifest change:
# Add 'alarms' to permissions array in wxt.config.ts
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  services/
    circuitBreaker/
      CircuitBreaker.ts     # Core class (~120 lines)
      circuitBreakerManager.ts  # Per-service instances + alarm listener
      types.ts              # State enum, config interface, persisted state shape
```

### Pattern 1: State Machine with Persistent State

**What:** A `CircuitBreaker` class implementing the CLOSED/OPEN/HALF_OPEN state machine with state persisted to `chrome.storage.session`.

**When to use:** Every external API call that can fail (LLM providers, ElevenLabs token endpoint).

**Key design:**

```typescript
// Source: Circuit breaker pattern (Microsoft Azure docs + codebase analysis)
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
  /** Unique identifier for this breaker (used as storage key + alarm name) */
  serviceId: string;
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Milliseconds to wait in OPEN state before transitioning to HALF_OPEN */
  recoveryTimeoutMs: number;
  /** Number of successes in HALF_OPEN needed to close the circuit */
  halfOpenSuccessThreshold: number;
}

interface PersistedCircuitState {
  state: CircuitState;
  failureCount: number;
  successCount: number;  // For HALF_OPEN phase
  lastFailureTime: number;
  openedAt: number | null;
}
```

### Pattern 2: Wrapping Existing Retry Logic (LLM)

**What:** The circuit breaker check happens *before* `streamWithRetry()` is called, not inside it. If the circuit is OPEN, an error is returned immediately without any network requests or retries.

**When to use:** In `handleLLMRequest()` in `background.ts`, after resolving the provider but before calling `streamWithRetry()`.

**Integration point (background.ts):**

```typescript
// BEFORE calling streamWithRetry for fast model:
const fastCircuit = circuitBreakerManager.getBreaker(fastResolution.provider.id);
if (fastCircuit.isOpen()) {
  // Immediately reject -- don't make network request
  fastComplete = true;
  await sendLLMMessageToMeet({
    type: 'LLM_STATUS',
    responseId,
    model: 'fast',
    status: 'error',
    error: `${fastResolution.provider.name} service unavailable (circuit open)`,
  });
  // Broadcast connection state for HealthIndicator
  await sendConnectionState('llm', 'error', 'Service temporarily unavailable');
} else {
  // Normal flow -- streamWithRetry handles retries
  // On success: fastCircuit.recordSuccess()
  // On final failure (after all retries exhausted): fastCircuit.recordFailure()
}
```

### Pattern 3: Alarm-Based Recovery Timeout

**What:** When circuit opens, create a `chrome.alarms` alarm instead of `setTimeout`. When the alarm fires, transition to HALF_OPEN.

**Why:** `setTimeout` is killed when the service worker terminates. `chrome.alarms` survives termination and wakes the worker.

**Constraint:** Minimum alarm interval is 30 seconds (Chrome 120+). During development with unpacked extensions, there is no minimum. This means recovery timeout must be at least 30 seconds in production, which is acceptable for our use case (30-60 seconds is standard for circuit breakers).

```typescript
// When circuit transitions to OPEN:
const alarmName = `circuit-recovery-${this.config.serviceId}`;
chrome.alarms.create(alarmName, {
  delayInMinutes: this.config.recoveryTimeoutMs / 60000,
});

// Alarm listener (registered once at module level):
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('circuit-recovery-')) {
    const serviceId = alarm.name.replace('circuit-recovery-', '');
    const breaker = circuitBreakerManager.getBreaker(serviceId);
    breaker.transitionToHalfOpen();
  }
});
```

### Pattern 4: Rehydration on Service Worker Startup

**What:** On service worker startup, load persisted circuit breaker state from `chrome.storage.session` before processing any API requests.

**When to use:** During the initialization chain in `background.ts`, after encryption init but before store rehydration (or in parallel with it).

```typescript
// background.ts initialization chain:
encryptionService.initialize()
  .then(() => circuitBreakerManager.rehydrate())  // Load state from session storage
  .then(() => storeReadyPromise)
  .then(() => {
    storeReady = true;
    // ... drain queue
  });
```

### Pattern 5: Per-Service Circuit Breaker Instances

**What:** Each API provider gets its own circuit breaker instance with independently configured thresholds.

| Service ID | Failure Threshold | Recovery Timeout | Rationale |
|------------|-------------------|------------------|-----------|
| `openai` | 3 | 60 seconds | Match success criteria requirement of "3+ consecutive failures". 60s is standard. |
| `openrouter` | 3 | 60 seconds | Same pattern as OpenAI |
| `elevenlabs` | 3 | 30 seconds | Token endpoint failures are simpler -- shorter recovery period |

**Note on threshold:** Success criteria #1 explicitly says "After 3+ consecutive API failures". Use 3 as the threshold for all providers.

### Anti-Patterns to Avoid

- **Global circuit breaker for all services:** OpenAI can be down while OpenRouter works. A global breaker would kill all LLM functionality when only one provider is failing. Use per-provider instances.
- **Circuit breaker INSIDE retry loop:** The breaker should wrap around the retry logic, not inside it. Each retry attempt should NOT increment the failure counter. Only the final failure after all retries are exhausted should increment.
- **Resetting failure count on any success:** In CLOSED state, a success should reset the consecutive failure counter to zero. But in HALF_OPEN state, success should increment a separate success counter toward the threshold for closing. Don't conflate these.
- **In-memory-only state:** Module-scope variables die with the service worker. All circuit state must be persisted to `chrome.storage.session`.
- **setTimeout for recovery:** Timers die with the worker. Use `chrome.alarms`.
- **Writing to storage on every single API call:** Debounce or batch writes. Only write when state actually changes (failure recorded, state transition).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service worker lifecycle timers | Custom setTimeout-based recovery | `chrome.alarms` API | Timers die with SW; alarms survive |
| Ephemeral state persistence | Custom in-memory cache | `chrome.storage.session` | Correct lifecycle (cleared on browser close), survives SW restart |

**Key insight:** The circuit breaker pattern itself IS a hand-roll job here. Opossum (the main circuit breaker library for Node.js) is overkill -- it's 15KB+, designed for long-running Node processes, uses Node.js-specific APIs, and adds event emitters, Hystrix metrics, and fallback orchestration we don't need. Our entire implementation is ~120 lines of TypeScript with 3 states and 2 counters.

## Common Pitfalls

### Pitfall 1: Circuit State Lost on Service Worker Termination

**What goes wrong:** Circuit breaker is implemented as a class instance with in-memory state. When Chrome terminates the service worker (30 seconds of inactivity), ALL state is wiped. The failure count resets to zero, the circuit resets to CLOSED, and the extension resumes hammering a failing API.

**Why it happens:** Chrome MV3 service workers are ephemeral. Any `let`, `const`, class instance, or `Map` in module scope is destroyed on termination.

**How to avoid:**
1. Persist all circuit state to `chrome.storage.session` on every state transition.
2. Rehydrate state from storage on service worker startup.
3. Use `chrome.alarms` for recovery timeout, not `setTimeout`.
4. Only write on state changes (not every call), to avoid storage write overhead.

**Warning signs:** API calls continue to fail repeatedly even though the circuit should be open. No "Service unavailable" message ever appears in the UI.

### Pitfall 2: Recovery Alarm Never Fires

**What goes wrong:** `setTimeout` is used for the OPEN-to-HALF_OPEN transition. Worker terminates during the timeout period. When worker restarts, the timeout is gone and the circuit stays permanently OPEN until browser restart.

**Why it happens:** `setTimeout` and `setInterval` are JavaScript runtime features that die with the execution context.

**How to avoid:** Use `chrome.alarms.create()` with `delayInMinutes`. The alarm fires even if the worker is terminated and restarts it if needed.

**Warning signs:** Circuit opens correctly but never transitions to HALF_OPEN. Service is permanently marked as unavailable until browser restart.

### Pitfall 3: Counting Retries as Separate Failures

**What goes wrong:** Each retry attempt inside `streamWithRetry()` is counted as a separate failure. With 3 retries and a threshold of 3, a single request failure (that exhausts retries) immediately opens the circuit.

**Why it happens:** The circuit breaker's `recordFailure()` is called on each retry instead of only after the final failure.

**How to avoid:** The circuit breaker wraps AROUND `streamWithRetry()`, not inside it. Only call `recordFailure()` after the final retry is exhausted and `streamWithRetry()` throws.

**Warning signs:** Circuit opens after just one request failure instead of three independent request failures.

### Pitfall 4: chrome.alarms Minimum Interval

**What goes wrong:** Setting `delayInMinutes: 0.1` (6 seconds) for recovery timeout. Chrome silently raises it to 0.5 (30 seconds) in production and logs a warning.

**Why it happens:** Chrome 120+ enforces a minimum alarm interval of 30 seconds. In development (unpacked extension), there is no minimum.

**How to avoid:** Set recovery timeout to at least 30 seconds (0.5 minutes). Our planned values (30-60 seconds) already satisfy this constraint. During development testing, shorter values work because unpacked extensions bypass the minimum.

**Warning signs:** Recovery takes longer than configured timeout in production. Console warning about alarm interval.

### Pitfall 5: Missing 'alarms' Permission

**What goes wrong:** `chrome.alarms.create()` call fails silently or throws. Circuit opens but recovery timeout never triggers.

**Why it happens:** The `alarms` permission was not added to `wxt.config.ts` manifest permissions.

**How to avoid:** Add `'alarms'` to the `permissions` array in `wxt.config.ts` (line 22). Currently only has `['tabCapture', 'activeTab', 'offscreen', 'storage', 'scripting']`.

**Warning signs:** Console error about `chrome.alarms` being undefined. Circuit permanently stays OPEN.

### Pitfall 6: ElevenLabs Circuit Breaker Runs in Wrong Context

**What goes wrong:** The ElevenLabs WebSocket connection and token requests happen in the offscreen document (not the service worker). If the circuit breaker only runs in the background service worker, the offscreen document has no way to check it.

**Why it happens:** The codebase splits audio processing into the offscreen document (`entrypoints/offscreen/main.ts`) while LLM calls happen in the background script.

**How to avoid:** Two approaches:
1. **(Simpler)** The circuit breaker for ElevenLabs runs in the background service worker. The offscreen document sends `START_TRANSCRIPTION` to background, and background checks the circuit before forwarding. The token-fetch failure/success is reported back via messages.
2. **(More complex)** Duplicate circuit breaker logic in offscreen. Not recommended -- adds complexity and state synchronization burden.

**Recommended:** Option 1. The background already mediates all transcription lifecycle messages. Add the circuit breaker check in the `START_TRANSCRIPTION` handler.

### Pitfall 7: Race Condition on Storage Rehydration

**What goes wrong:** A request arrives before circuit breaker state is loaded from `chrome.storage.session`. The circuit defaults to CLOSED and allows the request through, even though the persisted state was OPEN.

**Why it happens:** `chrome.storage.session.get()` is async. If a message arrives during service worker startup before rehydration completes, the circuit breaker has default (CLOSED) state.

**How to avoid:** Circuit breaker rehydration should be part of the initialization chain in `background.ts`, before `storeReady = true`. Messages are already queued until the store is ready, so circuit breaker rehydration happening in that same chain guarantees it's loaded before any API requests are processed.

## Code Examples

Verified patterns from official sources and codebase analysis:

### chrome.storage.session Read/Write

```typescript
// Source: Chrome Extensions docs (chrome.storage)
// Write circuit state
await chrome.storage.session.set({
  [`circuit_${serviceId}`]: {
    state: CircuitState.OPEN,
    failureCount: 3,
    successCount: 0,
    lastFailureTime: Date.now(),
    openedAt: Date.now(),
  } satisfies PersistedCircuitState,
});

// Read circuit state
const result = await chrome.storage.session.get(`circuit_${serviceId}`);
const persisted = result[`circuit_${serviceId}`] as PersistedCircuitState | undefined;
if (persisted) {
  // Rehydrate from persisted state
}
```

### chrome.alarms Create and Listen

```typescript
// Source: Chrome Extensions docs (chrome.alarms)
// Create recovery alarm (30-second delay = 0.5 minutes)
chrome.alarms.create(`circuit-recovery-${serviceId}`, {
  delayInMinutes: 0.5,  // 30 seconds (minimum for Chrome 120+)
});

// Listen for alarm (register once at top level)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('circuit-recovery-')) {
    const serviceId = alarm.name.replace('circuit-recovery-', '');
    // Transition to HALF_OPEN
  }
});

// Clear alarm when circuit closes (cancel pending recovery)
chrome.alarms.clear(`circuit-recovery-${serviceId}`);
```

### Integration with Existing streamWithRetry

```typescript
// Source: Codebase analysis (background.ts:198-242)
// Existing: streamWithRetry has MAX_LLM_RETRIES = 3, LLM_RETRY_DELAY_MS = 1000
// Circuit breaker wraps AROUND this, not inside it.

// In handleLLMRequest, before starting streamWithRetry:
const breaker = circuitBreakerManager.getBreaker(resolution.provider.id);

if (!breaker.allowRequest()) {
  // Circuit is OPEN -- reject immediately
  await sendLLMMessageToMeet({
    type: 'LLM_STATUS',
    responseId,
    model: modelType,
    status: 'error',
    error: `Service temporarily unavailable. Will retry automatically.`,
  });
  return;
}

// Circuit is CLOSED or HALF_OPEN -- proceed with request
try {
  await streamWithRetry(params, modelType, responseId);
  breaker.recordSuccess();
} catch (error) {
  breaker.recordFailure();
  throw error;
}
```

### HealthIndicator Integration (Already Exists)

```typescript
// Source: Codebase (src/overlay/HealthIndicator.tsx)
// The HealthIndicator already supports the exact states needed:
export type HealthIssue = {
  service: string;
  status: 'warning' | 'error' | 'reconnecting';  // 'error' for circuit OPEN
  message: string;
};

// In Overlay.tsx, CONNECTION_STATE events already feed into HealthIndicator.
// Circuit OPEN state broadcasts as:
await sendConnectionState('llm', 'error', 'Service temporarily unavailable');
// Circuit HALF_OPEN state broadcasts as:
await sendConnectionState('llm', 'reconnecting', 'Testing service recovery...');
// Circuit CLOSED state broadcasts as:
await sendConnectionState('llm', 'connected');
```

### Relative Imports (Prior Decision 10-01)

```typescript
// Source: Prior decision [10-01] -- relative imports for src/services files
// In src/services/circuitBreaker/CircuitBreaker.ts:
import type { PersistedCircuitState, CircuitBreakerConfig } from './types';

// In entrypoints/background.ts:
import { circuitBreakerManager } from '../src/services/circuitBreaker/circuitBreakerManager';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory circuit breaker state | `chrome.storage.session` persistence | Chrome 102 (session), 112 (10MB quota) | State survives SW termination |
| `setTimeout` for recovery | `chrome.alarms` for recovery | Chrome MV3 launch | Timers survive SW termination |
| 1-minute minimum alarm interval | 30-second minimum (Chrome 120+) | 2024 | Faster recovery testing possible |

**Deprecated/outdated:**
- **`localStorage`/`sessionStorage`:** Not available in service workers. Will throw ReferenceError.
- **Background pages (MV2):** Were persistent, so in-memory state was fine. MV3 service workers are ephemeral.

## Open Questions

1. **Should ElevenLabs circuit breaker operate at background level or offscreen level?**
   - What we know: Token requests (`obtainToken()`) and WebSocket connections happen in the offscreen document. The background script mediates via message passing (`START_TRANSCRIPTION` handler).
   - What's unclear: Whether to intercept at the background message handler (simpler, less precise) or create a circuit breaker in the offscreen context (more precise, more complex).
   - Recommendation: Intercept at background level. The existing `START_TRANSCRIPTION` handler already checks API key validity. Adding a circuit breaker check there is natural. Failures are communicated back via `TRANSCRIPTION_ERROR` messages which already exist. The offscreen document's internal reconnection logic (3 retries with exponential backoff in `ElevenLabsConnection`) feeds failure signals back to background via messages.

2. **Should the circuit breaker state change trigger an immediate UI update or wait for the next API call?**
   - What we know: The OPEN-to-HALF_OPEN transition happens via alarm, which wakes the service worker. The UI won't know until background broadcasts a CONNECTION_STATE message.
   - What's unclear: Should the alarm handler immediately broadcast the state change, or should it only matter when the next request is attempted?
   - Recommendation: Broadcast immediately on alarm fire. The user should see "Testing recovery..." (reconnecting state) as soon as the recovery window opens. This provides feedback that the system is self-healing.

3. **Debouncing `chrome.storage.session` writes -- is it necessary?**
   - What we know: State only changes on failure recording or state transitions. Under normal operation (circuit CLOSED, API working), there are zero writes. Writes only happen when things go wrong.
   - What's unclear: If an API returns rapid-fire errors (e.g., 3 failures in quick succession), we get 3 writes followed by a state transition write. This is 4 writes total, which is trivial.
   - Recommendation: No debouncing needed. Write on every state change. The volume is inherently low (at most a few writes during a failure episode).

## Sources

### Primary (HIGH confidence)

- [Chrome Storage API docs](https://developer.chrome.com/docs/extensions/reference/api/storage) - `chrome.storage.session` API surface, 10MB quota (Chrome 112+), in-memory only
- [Chrome Alarms API docs](https://developer.chrome.com/docs/extensions/reference/api/alarms) - Minimum 30-second interval (Chrome 120+), survives SW termination, wakes SW
- [Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) - SW termination after 30 seconds of inactivity, state loss behavior
- [Circuit Breaker Pattern (Microsoft Azure Architecture)](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker) - Canonical pattern definition, CLOSED/OPEN/HALF_OPEN states

### Secondary (MEDIUM confidence)

- Existing codebase research (`.planning/research/STACK.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md`) - Prior architecture decisions and pitfall analysis for this exact use case

### Tertiary (LOW confidence)

- None. All findings verified with primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No external dependencies, using well-documented Chrome APIs (`chrome.storage.session`, `chrome.alarms`), pattern is canonical
- Architecture: HIGH - Integration points are clearly identified in existing codebase (background.ts `streamWithRetry`, `handleLLMRequest`, `START_TRANSCRIPTION` handler), UI pipeline already exists (`HealthIndicator`)
- Pitfalls: HIGH - Service worker state loss is well-documented by Chrome team. Alarm constraints documented. Prior research (PITFALLS.md #6) already identified the key pitfall

**Research date:** 2026-02-08
**Valid until:** 2026-03-10 (stable pattern, no rapidly moving dependencies)

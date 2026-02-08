---
created: 2026-02-08
title: Circuit Breaker Pattern for API Retry Logic
area: refactor
priority: P1
version: v2.1
complexity: medium
estimate: 1-2 days
files:
  - src/services/api/circuitBreaker.ts
  - src/services/llm/openai.ts
  - src/services/transcription/elevenlabs.ts
  - src/utils/retry.ts
---

## Problem

API calls (OpenAI, ElevenLabs, OpenRouter) can fail due to:
- Network issues
- Rate limiting (429 errors)
- Service outages (5xx errors)
- Temporary unavailability

Currently, there's no robust retry logic or circuit breaker pattern to handle these failures gracefully. Failed requests may cascade, waste resources, or provide poor UX.

## User Requirements

- **Automatic retries:** Retry failed API calls with exponential backoff
- **Circuit breaker:** Stop calling failing APIs temporarily to allow recovery
- **User feedback:** Show meaningful error messages and retry status
- **Cost efficiency:** Don't waste API calls on known-failing endpoints
- **Configurability:** User can adjust retry behavior in Settings

## Solution

### Circuit Breaker Pattern

The Circuit Breaker pattern has 3 states:

1. **CLOSED (Normal):** Requests pass through, failures tracked
2. **OPEN (Failed):** Requests fail immediately, no API calls made
3. **HALF_OPEN (Testing):** Allow one request to test if service recovered

```typescript
enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

interface CircuitBreakerConfig {
  failureThreshold: number;      // Open after N failures (default: 5)
  successThreshold: number;      // Close after N successes in half-open (default: 2)
  timeout: number;               // Time in OPEN before HALF_OPEN (default: 60s)
  resetTimeout: number;          // Reset failure count after success (default: 30s)
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = 0;
  private config: CircuitBreakerConfig;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new CircuitOpenError('Service temporarily unavailable');
      }
      // Transition to HALF_OPEN
      this.state = CircuitState.HALF_OPEN;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;
    }
  }
}
```

### Retry Logic with Exponential Backoff

```typescript
interface RetryConfig {
  maxAttempts: number;           // Max retry attempts (default: 3)
  initialDelay: number;          // Initial delay in ms (default: 1000)
  maxDelay: number;              // Max delay in ms (default: 30000)
  backoffMultiplier: number;     // Multiply delay by this (default: 2)
  retryableStatusCodes: number[]; // Status codes to retry (default: [429, 500, 502, 503, 504])
  retryableErrors: string[];     // Error types to retry (default: ['ECONNRESET', 'ETIMEDOUT'])
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error;
  let delay = config.initialDelay;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if not retryable
      if (!isRetryableError(error, config)) {
        throw error;
      }

      // Last attempt - throw error
      if (attempt === config.maxAttempts) {
        throw error;
      }

      // Wait with exponential backoff
      await sleep(delay);
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);

      console.log(`Retry attempt ${attempt + 1}/${config.maxAttempts}`);
    }
  }

  throw lastError;
}

function isRetryableError(error: any, config: RetryConfig): boolean {
  // HTTP status code
  if (error.response?.status) {
    return config.retryableStatusCodes.includes(error.response.status);
  }

  // Network error
  if (error.code) {
    return config.retryableErrors.includes(error.code);
  }

  return false;
}
```

### Integration with API Services

**OpenAI Service:**
```typescript
class OpenAIService {
  private circuitBreaker: CircuitBreaker;
  private retryConfig: RetryConfig;

  async chat(messages: Message[]): Promise<ChatResponse> {
    return this.circuitBreaker.execute(async () => {
      return retryWithBackoff(
        () => this.makeAPICall(messages),
        this.retryConfig
      );
    });
  }

  private async makeAPICall(messages: Message[]): Promise<ChatResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages
      })
    });

    if (!response.ok) {
      throw new APIError(response.status, await response.text());
    }

    return response.json();
  }
}
```

**ElevenLabs Service:**
```typescript
class ElevenLabsService {
  private circuitBreaker: CircuitBreaker;
  private retryConfig: RetryConfig;

  async transcribe(audio: AudioBuffer): Promise<TranscriptSegment[]> {
    return this.circuitBreaker.execute(async () => {
      return retryWithBackoff(
        () => this.makeTranscriptionCall(audio),
        this.retryConfig
      );
    });
  }
}
```

### Architecture

```typescript
// Circuit breaker per service
const circuitBreakers = {
  openai: new CircuitBreaker({ failureThreshold: 5, timeout: 60000 }),
  elevenlabs: new CircuitBreaker({ failureThreshold: 3, timeout: 30000 }),
  openrouter: new CircuitBreaker({ failureThreshold: 5, timeout: 60000 })
};

// Global retry config (can be overridden per service)
const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
};
```

### User Feedback

**During retry:**
```tsx
<Toast variant="warning">
  API call failed. Retrying (attempt 2/3)...
</Toast>
```

**Circuit breaker open:**
```tsx
<Toast variant="error">
  OpenAI service temporarily unavailable. Trying again in 60 seconds...
</Toast>
```

**Manual retry option:**
```tsx
<Button onClick={handleManualRetry}>
  Retry Now
</Button>
```

### Settings Configuration

**Settings → Advanced → API Reliability:**
```
┌─────────────────────────────────────┐
│ API Retry Configuration             │
├─────────────────────────────────────┤
│ Max Retry Attempts: [3 ▼]           │
│ Initial Delay: [1000 ms]            │
│ Max Delay: [30000 ms]               │
│                                     │
│ Circuit Breaker:                    │
│ Failure Threshold: [5 failures]     │
│ Recovery Timeout: [60 seconds]      │
│                                     │
│ ☑ Show retry notifications          │
│ ☑ Enable circuit breaker            │
│                                     │
│ [Reset to Defaults]                 │
└─────────────────────────────────────┘
```

### Implementation Steps

1. **Create circuit breaker utility**
   - Implement CircuitBreaker class
   - State machine (CLOSED/OPEN/HALF_OPEN)
   - Configuration management

2. **Create retry utility**
   - Implement retryWithBackoff function
   - Exponential backoff logic
   - Retryable error detection

3. **Integrate with API services**
   - Wrap OpenAI calls with circuit breaker + retry
   - Wrap ElevenLabs calls with circuit breaker + retry
   - Wrap OpenRouter calls (if still present)

4. **Add user feedback**
   - Toast notifications during retry
   - Circuit breaker status indicator
   - Manual retry button

5. **Add Settings UI**
   - Retry configuration
   - Circuit breaker configuration
   - Enable/disable toggles

6. **Testing**
   - Simulate API failures
   - Test exponential backoff timing
   - Test circuit breaker state transitions
   - Test recovery

### Error Handling Strategy

**Rate Limiting (429):**
- Respect `Retry-After` header if present
- Otherwise use exponential backoff
- Show user friendly message

**Server Errors (5xx):**
- Retry with backoff
- Open circuit breaker after threshold
- Allow recovery

**Client Errors (4xx except 429):**
- Don't retry (user error, bad request, unauthorized)
- Show error to user immediately

**Network Errors:**
- Retry with backoff
- Check internet connectivity
- Fallback message if offline

### Monitoring & Metrics

Track circuit breaker metrics:
```typescript
interface CircuitBreakerMetrics {
  serviceName: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastStateChange: number;
  totalFailures: number;
  totalSuccesses: number;
}
```

Optional: Send to analytics or show in Settings → Usage.

### Dependencies

- Existing API service infrastructure
- Toast notification system (or create if needed)
- Settings store

### Testing Checklist

- [ ] Circuit breaker transitions CLOSED → OPEN
- [ ] Circuit breaker transitions OPEN → HALF_OPEN
- [ ] Circuit breaker transitions HALF_OPEN → CLOSED
- [ ] Circuit breaker stays OPEN during timeout
- [ ] Retry with exponential backoff works
- [ ] Max attempts enforced
- [ ] Retryable errors detected correctly
- [ ] Non-retryable errors fail immediately
- [ ] Rate limiting (429) handled with Retry-After
- [ ] Toast notifications show during retry
- [ ] Circuit breaker open message shows
- [ ] Manual retry button works
- [ ] Settings configuration persists
- [ ] OpenAI service uses circuit breaker
- [ ] ElevenLabs service uses circuit breaker
- [ ] Cost tracking not affected by retries

### References

- [Circuit Breaker Pattern (Martin Fowler)](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff (Google Cloud)](https://cloud.google.com/iot/docs/how-tos/exponential-backoff)
- [OpenAI API Rate Limiting](https://platform.openai.com/docs/guides/rate-limits)

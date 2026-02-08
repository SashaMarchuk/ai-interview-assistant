/**
 * Circuit Breaker Manager
 *
 * Manages per-service CircuitBreaker instances and coordinates
 * alarm-based recovery. Provides a clean API for background.ts
 * to check/record circuit state without managing individual breakers.
 *
 * Pre-configured instances:
 * - openai: 3 failures, 60s recovery
 * - openrouter: 3 failures, 60s recovery
 * - elevenlabs: 3 failures, 30s recovery
 */

import { CircuitBreaker } from './CircuitBreaker';
import { CircuitState } from './types';
import type { CircuitBreakerConfig } from './types';

const ALARM_PREFIX = 'circuit-recovery-';

/** Default configurations for each service */
const SERVICE_CONFIGS: CircuitBreakerConfig[] = [
  {
    serviceId: 'openai',
    failureThreshold: 3,
    recoveryTimeoutMs: 60_000,
    halfOpenSuccessThreshold: 1,
  },
  {
    serviceId: 'openrouter',
    failureThreshold: 3,
    recoveryTimeoutMs: 60_000,
    halfOpenSuccessThreshold: 1,
  },
  {
    serviceId: 'elevenlabs',
    failureThreshold: 3,
    recoveryTimeoutMs: 30_000,
    halfOpenSuccessThreshold: 1,
  },
];

/** Internal registry of breaker instances */
const breakers = new Map<string, CircuitBreaker>();

/** State change callback set by background.ts */
let stateChangeCallback: ((serviceId: string, state: CircuitState) => void) | null = null;

// Initialize breaker instances
for (const config of SERVICE_CONFIGS) {
  const breaker = new CircuitBreaker(config);
  breaker.setOnStateChange((serviceId, state) => {
    stateChangeCallback?.(serviceId, state);
  });
  breakers.set(config.serviceId, breaker);
}

// Register alarm listener for recovery timeouts
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;

  const serviceId = alarm.name.slice(ALARM_PREFIX.length);
  const breaker = breakers.get(serviceId);
  if (!breaker) return;

  await breaker.transitionToHalfOpen();
});

export const circuitBreakerManager = {
  /**
   * Get the circuit breaker for a specific service
   * @throws Error if serviceId is not registered
   */
  getBreaker(serviceId: string): CircuitBreaker {
    const breaker = breakers.get(serviceId);
    if (!breaker) {
      throw new Error(`Unknown circuit breaker service: ${serviceId}`);
    }
    return breaker;
  },

  /** Rehydrate all breaker states from chrome.storage.session */
  async rehydrate(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const breaker of breakers.values()) {
      promises.push(breaker.rehydrate());
    }
    await Promise.all(promises);
  },
};

/**
 * Register a callback invoked on every circuit state transition.
 * Allows background.ts to broadcast CONNECTION_STATE without circular imports.
 */
export function setStateChangeCallback(
  cb: (serviceId: string, state: CircuitState) => void
): void {
  stateChangeCallback = cb;
}

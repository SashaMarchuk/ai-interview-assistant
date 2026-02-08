/**
 * CircuitBreaker
 *
 * Implements the circuit breaker pattern with three states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failures exceeded threshold, requests are immediately rejected
 * - HALF_OPEN: Recovery test, allowing a single request to probe service health
 *
 * State is persisted to chrome.storage.session to survive service worker restarts.
 * Recovery timeouts use chrome.alarms (not setTimeout) for reliability in MV3.
 */

import { CircuitState } from './types';
import type { CircuitBreakerConfig, PersistedCircuitState } from './types';

const STORAGE_PREFIX = 'circuit_';
const ALARM_PREFIX = 'circuit-recovery-';

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private currentState: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private openedAt: number | null = null;
  private onStateChange?: (serviceId: string, state: CircuitState) => void;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /** Register a callback invoked on every state transition */
  setOnStateChange(cb: (serviceId: string, state: CircuitState) => void): void {
    this.onStateChange = cb;
  }

  /** Returns true if the circuit allows a request through */
  allowRequest(): boolean {
    return this.currentState !== CircuitState.OPEN;
  }

  /** Record a successful request */
  async recordSuccess(): Promise<void> {
    if (this.currentState === CircuitState.CLOSED) {
      // Reset failure count on success in CLOSED state
      if (this.failureCount > 0) {
        this.failureCount = 0;
        await this.persist();
      }
      return;
    }

    if (this.currentState === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenSuccessThreshold) {
        // Recovery confirmed -- close the circuit
        this.currentState = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.openedAt = null;
        await chrome.alarms.clear(`${ALARM_PREFIX}${this.config.serviceId}`);
        await this.persist();
        this.onStateChange?.(this.config.serviceId, CircuitState.CLOSED);
      } else {
        await this.persist();
      }
    }
  }

  /** Record a failed request */
  async recordFailure(): Promise<void> {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.currentState === CircuitState.CLOSED && this.failureCount >= this.config.failureThreshold) {
      // Threshold exceeded -- open the circuit
      this.currentState = CircuitState.OPEN;
      this.openedAt = Date.now();
      await this.createRecoveryAlarm();
      await this.persist();
      this.onStateChange?.(this.config.serviceId, CircuitState.OPEN);
      return;
    }

    if (this.currentState === CircuitState.HALF_OPEN) {
      // Test request failed -- back to OPEN
      this.currentState = CircuitState.OPEN;
      this.openedAt = Date.now();
      this.successCount = 0;
      await this.createRecoveryAlarm();
      await this.persist();
      this.onStateChange?.(this.config.serviceId, CircuitState.OPEN);
      return;
    }

    // CLOSED but below threshold -- just persist the count
    await this.persist();
  }

  /** Transition from OPEN to HALF_OPEN (called by alarm listener) */
  async transitionToHalfOpen(): Promise<void> {
    if (this.currentState !== CircuitState.OPEN) return;
    this.currentState = CircuitState.HALF_OPEN;
    this.successCount = 0;
    await this.persist();
    this.onStateChange?.(this.config.serviceId, CircuitState.HALF_OPEN);
  }

  /** Rehydrate state from chrome.storage.session after service worker restart */
  async rehydrate(): Promise<void> {
    const key = `${STORAGE_PREFIX}${this.config.serviceId}`;
    const result = await chrome.storage.session.get(key);
    const persisted = result[key] as PersistedCircuitState | undefined;

    if (!persisted) return;

    this.currentState = persisted.state;
    this.failureCount = persisted.failureCount;
    this.successCount = persisted.successCount;
    this.lastFailureTime = persisted.lastFailureTime;
    this.openedAt = persisted.openedAt;

    // If OPEN and recovery timeout already elapsed, transition immediately
    if (this.currentState === CircuitState.OPEN && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.recoveryTimeoutMs) {
        await this.transitionToHalfOpen();
      }
    }
  }

  /** Get current circuit state */
  getState(): CircuitState {
    return this.currentState;
  }

  /** Get the service ID this breaker protects */
  getServiceId(): string {
    return this.config.serviceId;
  }

  /** Persist current state to chrome.storage.session */
  private async persist(): Promise<void> {
    const key = `${STORAGE_PREFIX}${this.config.serviceId}`;
    const data: PersistedCircuitState = {
      state: this.currentState,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      openedAt: this.openedAt,
    };
    await chrome.storage.session.set({ [key]: data });
  }

  /** Create a chrome.alarm for recovery timeout */
  private async createRecoveryAlarm(): Promise<void> {
    const alarmName = `${ALARM_PREFIX}${this.config.serviceId}`;
    // Clear any existing alarm first
    await chrome.alarms.clear(alarmName);
    await chrome.alarms.create(alarmName, {
      delayInMinutes: this.config.recoveryTimeoutMs / 60000,
    });
  }
}

/**
 * Circuit Breaker Types
 *
 * Defines the state machine states, configuration, and persisted state
 * for the circuit breaker pattern used to protect external API calls.
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  /** Unique identifier for the service (e.g., 'openai', 'openrouter', 'elevenlabs') */
  serviceId: string;
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms before attempting recovery (OPEN -> HALF_OPEN) */
  recoveryTimeoutMs: number;
  /** Number of successes in HALF_OPEN needed to close the circuit */
  halfOpenSuccessThreshold: number;
}

export interface PersistedCircuitState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  openedAt: number | null;
}

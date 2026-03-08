/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by failing fast when a service is unhealthy
 */

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing fast, not allowing requests
  HALF_OPEN = 'half_open', // Testing if service recovered
}

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  // Name for logging
  name: string;
  // Number of failures before opening circuit
  failureThreshold?: number;
  // Number of successes in half-open to close circuit
  successThreshold?: number;
  // Time to wait before trying again (ms)
  resetTimeout?: number;
  // Time window for counting failures (ms)
  failureWindow?: number;
  // Optional callback when state changes
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

const DEFAULT_OPTIONS = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: 30000, // 30 seconds
  failureWindow: 60000, // 1 minute
};

/**
 * Circuit Breaker
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit is tripped, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 */
export class CircuitBreaker {
  private name: string;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number = 0;
  private nextAttempt: number = 0;
  private failureThreshold: number;
  private successThreshold: number;
  private resetTimeout: number;
  private failureWindow: number;
  private onStateChange?: (from: CircuitState, to: CircuitState) => void;

  // Metrics
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private totalRejected = 0;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? DEFAULT_OPTIONS.failureThreshold;
    this.successThreshold = options.successThreshold ?? DEFAULT_OPTIONS.successThreshold;
    this.resetTimeout = options.resetTimeout ?? DEFAULT_OPTIONS.resetTimeout;
    this.failureWindow = options.failureWindow ?? DEFAULT_OPTIONS.failureWindow;
    this.onStateChange = options.onStateChange;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttempt) {
        // Try to recover
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        this.totalRejected++;
        throw new CircuitBreakerError(
          `Circuit breaker [${this.name}] is OPEN`,
          this.state,
          this.nextAttempt - Date.now()
        );
      }
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

  /**
   * Check if circuit allows requests
   */
  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }
    if (this.state === CircuitState.HALF_OPEN) {
      return true;
    }
    if (this.state === CircuitState.OPEN && Date.now() >= this.nextAttempt) {
      return true;
    }
    return false;
  }

  /**
   * Handle successful call
   */
  private onSuccess(): void {
    this.totalSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success if outside failure window
      if (Date.now() - this.lastFailureTime > this.failureWindow) {
        this.failureCount = 0;
      }
    }
  }

  /**
   * Handle failed call
   */
  private onFailure(): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open goes back to open
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.nextAttempt = Date.now() + this.resetTimeout;
      this.successCount = 0;
      console.log(
        `[CircuitBreaker:${this.name}] OPEN - will retry at ${new Date(this.nextAttempt).toISOString()}`
      );
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
      console.log(`[CircuitBreaker:${this.name}] HALF_OPEN - testing recovery`);
    } else if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      console.log(`[CircuitBreaker:${this.name}] CLOSED - recovered`);
    }

    if (this.onStateChange && oldState !== newState) {
      this.onStateChange(oldState, newState);
    }
  }

  /**
   * Force circuit to open state
   */
  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Force circuit to closed state
   */
  forceClosed(): void {
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): {
    name: string;
    state: CircuitState;
    totalCalls: number;
    totalSuccesses: number;
    totalFailures: number;
    totalRejected: number;
    failureRate: number;
    currentFailureCount: number;
    timeUntilRetry?: number;
  } {
    const failureRate = this.totalCalls > 0
      ? this.totalFailures / this.totalCalls
      : 0;

    return {
      name: this.name,
      state: this.state,
      totalCalls: this.totalCalls,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      totalRejected: this.totalRejected,
      failureRate,
      currentFailureCount: this.failureCount,
      timeUntilRetry: this.state === CircuitState.OPEN
        ? Math.max(0, this.nextAttempt - Date.now())
        : undefined,
    };
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.totalCalls = 0;
    this.totalSuccesses = 0;
    this.totalFailures = 0;
    this.totalRejected = 0;
    this.failureCount = 0;
    this.successCount = 0;
  }
}

/**
 * Circuit breaker error
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: CircuitState,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit breaker registry for managing multiple breakers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker
   */
  getOrCreate(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({ name, ...options });
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /**
   * Get an existing circuit breaker
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Get metrics for all circuit breakers
   */
  getAllMetrics(): Array<ReturnType<CircuitBreaker['getMetrics']>> {
    return Array.from(this.breakers.values()).map((b) => b.getMetrics());
  }

  /**
   * Get unhealthy circuit breakers (open or half-open)
   */
  getUnhealthy(): CircuitBreaker[] {
    return Array.from(this.breakers.values()).filter(
      (b) => b.getState() !== CircuitState.CLOSED
    );
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceClosed();
      breaker.resetMetrics();
    }
  }
}

// Global registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

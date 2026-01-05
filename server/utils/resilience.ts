/**
 * Enterprise Resilience Utilities
 * Provides retry logic, circuit breaker, and fault tolerance patterns
 */

import { createSafeLogger } from './safeLogger';

const resilienceLogger = createSafeLogger('CircuitBreaker');

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'RATE_LIMIT',
    '429',
    '500',
    '502',
    '503',
    '504',
  ],
};

const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenRequests: 3,
};

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, options.maxDelayMs);
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error, retryableErrors: string[]): boolean {
  const errorString = error.message + (error.name || '') + ((error as any).code || '');
  return retryableErrors.some(pattern => 
    errorString.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Execute a function with exponential backoff retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if this is the last attempt or error is not retryable
      if (attempt === opts.maxRetries) {
        break;
      }

      if (!isRetryableError(lastError, opts.retryableErrors || [])) {
        throw lastError;
      }

      const delayMs = calculateDelay(attempt, opts);
      
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, lastError, delayMs);
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private halfOpenSuccesses = 0;
  private options: CircuitBreakerOptions;
  private name: string;

  constructor(name: string, options: Partial<CircuitBreakerOptions> = {}) {
    this.name = name;
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      
      if (this.options.onStateChange) {
        this.options.onStateChange(oldState, newState);
      }

      resilienceLogger.info(`[${this.name}] State transition: ${oldState} → ${newState}`);
    }
  }

  /**
   * Check if the circuit should allow a request
   */
  private shouldAllowRequest(): boolean {
    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Check if reset timeout has elapsed
        if (this.lastFailureTime && 
            Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
          this.transitionTo('HALF_OPEN');
          this.halfOpenSuccesses = 0;
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful call
   */
  private recordSuccess(): void {
    this.failureCount = 0;
    this.successCount++;

    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.options.halfOpenRequests) {
        this.transitionTo('CLOSED');
      }
    }
  }

  /**
   * Record a failed call
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.shouldAllowRequest()) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker '${this.name}' is OPEN. Request rejected.`,
        this.name,
        this.options.resetTimeoutMs - (Date.now() - (this.lastFailureTime || 0))
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenSuccesses = 0;
  }
}

/**
 * Custom error for circuit breaker open state
 */
export class CircuitBreakerOpenError extends Error {
  public readonly circuitName: string;
  public readonly retryAfterMs: number;

  constructor(message: string, circuitName: string, retryAfterMs: number) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = circuitName;
    this.retryAfterMs = Math.max(0, retryAfterMs);
  }
}

/**
 * Combine retry logic with circuit breaker
 */
export async function withResiliency<T>(
  fn: () => Promise<T>,
  circuitBreaker: CircuitBreaker,
  retryOptions: Partial<RetryOptions> = {}
): Promise<T> {
  return circuitBreaker.execute(() => withRetry(fn, retryOptions));
}

// Singleton circuit breakers for external services
export const mistralCircuitBreaker = new CircuitBreaker('mistral-ocr', {
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  halfOpenRequests: 2,
  onStateChange: (from, to) => {
    resilienceLogger.info(`[Mistral OCR] ${from} → ${to}`);
  },
});

export const geminiCircuitBreaker = new CircuitBreaker('gemini-analyzer', {
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  halfOpenRequests: 2,
  onStateChange: (from, to) => {
    resilienceLogger.info(`[Gemini Analyzer] ${from} → ${to}`);
  },
});

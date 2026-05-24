/**
 * Retry handler with exponential backoff for LLM API calls.
 *
 * Retries transient failures (network timeouts, HTTP 429/500/503)
 * while immediately propagating non-retryable errors (HTTP 400/401/403).
 * Backoff schedule: baseDelayMs × 2^attempt (default: 1s → 2s → 4s).
 */

/**
 * Configuration options for the retry handler.
 */
export interface RetryOptions {
  /** Maximum number of attempts before giving up. Default: 3. */
  maxAttempts: number;
  /** Base delay in milliseconds for exponential backoff. Default: 1000. */
  baseDelayMs: number;
  /** Timeout in milliseconds for the overall operation. Default: 30000. */
  timeoutMs: number;
}

/** A function that delays execution for the given number of milliseconds. */
export type DelayFn = (ms: number) => Promise<void>;

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  timeoutMs: 30000,
};

/**
 * Default delay function using setTimeout.
 */
function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * HTTP status codes that indicate a retryable server-side or rate-limit error.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);

/**
 * HTTP status codes that indicate a non-retryable client error.
 */
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403]);

/**
 * Network error codes that indicate a retryable transient failure.
 */
const RETRYABLE_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
]);

export class RetryHandler {
  private readonly options: RetryOptions;
  private readonly delayFn: DelayFn;

  constructor(options?: Partial<RetryOptions>, delayFn?: DelayFn) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.delayFn = delayFn ?? defaultDelay;
  }

  /**
   * Execute an operation with retry logic and exponential backoff.
   *
   * Retries on retryable errors up to `maxAttempts` times.
   * Returns immediately on non-retryable errors.
   * On success after retries, returns the successful result.
   * If all attempts fail, throws the error from the final attempt.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.options.maxAttempts; attempt++) {
      try {
        const result = await operation();
        return result;
      } catch (error: unknown) {
        lastError = error;

        if (!this.isRetryable(error)) {
          throw error;
        }

        // If this was the last attempt, don't delay — just throw
        if (attempt < this.options.maxAttempts - 1) {
          const delayMs = this.options.baseDelayMs * Math.pow(2, attempt);
          await this.delayFn(delayMs);
        }
      }
    }

    throw lastError;
  }

  /**
   * Determine whether an error is retryable.
   *
   * Retryable conditions:
   * - Error has a `status` property of 429, 500, or 503
   * - Error has a `code` property of 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'
   * - Error has a message containing 'timeout' (case-insensitive)
   *
   * Non-retryable conditions (checked first):
   * - Error has a `status` property of 400, 401, or 403
   */
  private isRetryable(error: unknown): boolean {
    if (error === null || error === undefined) {
      return false;
    }

    if (typeof error !== 'object') {
      // Check if it's a string containing 'timeout'
      if (typeof error === 'string' && /timeout/i.test(error)) {
        return true;
      }
      return false;
    }

    const err = error as Record<string, unknown>;

    // Check for non-retryable status codes first
    if ('status' in err && typeof err.status === 'number') {
      if (NON_RETRYABLE_STATUS_CODES.has(err.status)) {
        return false;
      }
      if (RETRYABLE_STATUS_CODES.has(err.status)) {
        return true;
      }
    }

    // Check for retryable network error codes
    if ('code' in err && typeof err.code === 'string') {
      if (RETRYABLE_ERROR_CODES.has(err.code)) {
        return true;
      }
    }

    // Check for timeout in message
    if ('message' in err && typeof err.message === 'string') {
      if (/timeout/i.test(err.message)) {
        return true;
      }
    }

    return false;
  }
}

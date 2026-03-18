// ─── UploadError ──────────────────────────────────────────────────────────────

/**
 * Structured error type for upload failures.
 * Carries the HTTP status code (when available) and whether the operation
 * should be retried. All UploadErrors thrown inside withRetry are evaluated
 * against the retryable flag before a sleep/retry is attempted.
 */
export class UploadError extends Error {
  readonly statusCode: number | null;
  readonly retryable: boolean;

  constructor(message: string, statusCode: number | null, retryable: boolean) {
    super(message);
    this.name = "UploadError";
    this.statusCode = statusCode;
    this.retryable = retryable;
  }

  /** Convenience factory — determines retryability from the HTTP status. */
  static fromResponse(status: number, message: string): UploadError {
    const retryable = status >= 500 || status === 408 || status === 429;
    return new UploadError(message, status, retryable);
  }
}

// ─── Retry classification ─────────────────────────────────────────────────────

/**
 * Returns true only for errors that are safe to retry.
 *
 * Retryable:
 *   - Network errors (TypeError: "Failed to fetch")
 *   - HTTP 5xx (server-side transient failures)
 *   - HTTP 408 Request Timeout
 *   - HTTP 429 Too Many Requests
 *
 * Not retryable:
 *   - AbortError (user paused intentionally)
 *   - HTTP 4xx other than 408/429 (permanent client errors)
 *   - UploadError with retryable: false (e.g. storage limit, not found)
 *   - Everything else (unknown errors treated conservatively)
 */
function isRetryable(error: unknown): boolean {
  // AbortError — never retry, the user deliberately interrupted
  if (error instanceof DOMException && error.name === "AbortError") return false;

  // Our typed error — trust the explicit flag
  if (error instanceof UploadError) return error.retryable;

  // Untyped TypeError from fetch = network failure (offline, DNS, CORS)
  if (error instanceof TypeError) return true;

  // Unknown error types: err on the side of not retrying
  return false;
}

// ─── Delay helpers ────────────────────────────────────────────────────────────

/**
 * Full-jitter exponential backoff.
 *   delay = min(baseDelay × 2^attempt + rand(0, 1000), maxDelay)
 *
 * The random jitter prevents a thunderstorm of concurrent uploads all
 * retrying at the same instant after a shared transient failure.
 */
function jitteredDelay(baseDelayMs: number, maxDelayMs: number, attempt: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 1000);
  return Math.min(exponential + jitter, maxDelayMs);
}

/**
 * Promise-based sleep that resolves after `ms` milliseconds.
 * Rejects immediately with an AbortError if the signal fires during the wait,
 * so callers can bail out without waiting the full delay.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

// ─── withRetry ────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of retries after the first attempt. Default: 5 */
  maxRetries?: number;
  /** Base delay in ms for the backoff calculation. Default: 2000 */
  baseDelayMs?: number;
  /** Upper cap on the backoff delay. Default: 30000 */
  maxDelayMs?: number;
  /**
   * Called before each retry sleep.
   * `attempt` is 1-indexed (1 = first retry, 2 = second, …).
   * Useful for updating UI state or logging.
   */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  /** When the signal fires during a sleep the delay is cut short and
   *  the AbortError is rethrown immediately to the caller. */
  signal?: AbortSignal;
}

/**
 * Calls `fn` and, on retryable failure, backs off and tries again up to
 * `maxRetries` times.
 *
 * Non-retryable errors (AbortError, permanent HTTP 4xx, storage limit, …)
 * are re-thrown immediately without consuming any retry budget.
 *
 * If all retries are exhausted the last error is thrown.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxRetries  = options.maxRetries  ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 2000;
  const maxDelayMs  = options.maxDelayMs  ?? 30000;
  const { onRetry, signal } = options;

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (!isRetryable(err)) throw err;          // permanent or intentional — stop immediately
      if (attempt === maxRetries) break;          // budget exhausted — fall through to throw

      const delayMs = jitteredDelay(baseDelayMs, maxDelayMs, attempt);
      onRetry?.(attempt + 1, lastError, delayMs); // 1-indexed for readability
      await sleep(delayMs, signal);               // may throw AbortError → unretryable, propagates up
    }
  }

  throw lastError;
}

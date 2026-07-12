/**
 * Timeout Utilities
 * 
 * Provides timeout wrappers for long-running operations to prevent hung processes.
 */

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Wraps a promise with a timeout.
 * If the promise doesn't resolve within the timeout period, rejects with TimeoutError.
 * 
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Human-readable name for error messages
 * @returns The promise result if it completes in time
 * @throws TimeoutError if timeout exceeded
 * 
 * @example
 * const result = await withTimeout(
 *   processDocument(docId),
 *   600000, // 10 minutes
 *   "Document processing"
 * );
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = "Operation"
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new TimeoutError(
          `${operationName} exceeded timeout of ${timeoutMs}ms`,
          timeoutMs
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Configuration for processing timeouts.
 * Override via environment variables for different deployment environments.
 */
export const TIMEOUT_CONFIG = {
  /** Document processing (OCR + AI analysis) */
  DOCUMENT_PROCESSING: parseInt(process.env.TIMEOUT_PROCESSING_MS || "600000", 10), // 10 min

  /** OCR extraction only */
  OCR_EXTRACTION: parseInt(process.env.TIMEOUT_OCR_MS || "180000", 10), // 3 min

  /** AI analysis only */
  AI_ANALYSIS: parseInt(process.env.TIMEOUT_AI_MS || "300000", 10), // 5 min

  /** File upload to storage */
  FILE_UPLOAD: parseInt(process.env.TIMEOUT_UPLOAD_MS || "60000", 10), // 1 min

  /** External API calls (general) */
  EXTERNAL_API: parseInt(process.env.TIMEOUT_API_MS || "30000", 10), // 30 sec

  /** Database queries (individual) */
  DATABASE_QUERY: parseInt(process.env.TIMEOUT_DB_MS || "10000", 10), // 10 sec
};

/**
 * Wraps a function with retry logic and timeout.
 * Useful for resilient external API calls.
 * 
 * @param fn - The function to execute
 * @param options - Retry and timeout configuration
 * @returns The function result if successful
 * 
 * @example
 * const result = await withRetryAndTimeout(
 *   () => fetch('https://api.example.com/data'),
 *   { maxAttempts: 3, timeoutMs: 5000, backoffMs: 1000 }
 * );
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    timeoutMs?: number;
    backoffMs?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    timeoutMs = TIMEOUT_CONFIG.EXTERNAL_API,
    backoffMs = 1000,
    operationName = "Operation",
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, operationName);
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on timeout - operation took too long
      if (error instanceof TimeoutError) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        throw error;
      }

      // Exponential backoff
      const delay = backoffMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error(`${operationName} failed after ${maxAttempts} attempts`);
}

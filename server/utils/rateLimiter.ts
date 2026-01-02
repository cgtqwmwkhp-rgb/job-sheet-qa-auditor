/**
 * Rate Limiter for API Endpoints
 * Provides token bucket and sliding window rate limiting
 */

export interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Maximum requests per window
  keyGenerator?: (req: any) => string;  // Function to generate rate limit key
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limits
const rateLimitStore: Map<string, RateLimitEntry> = new Map();

// Default configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 100,
  message: 'Too many requests, please try again later.',
};

// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Start cleanup timer
let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const entries = Array.from(rateLimitStore.entries());
    for (const [key, entry] of entries) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

startCleanup();

/**
 * Check rate limit for a key
 */
export function checkRateLimit(
  key: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitResult {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  // Create new entry or reset if window expired
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + opts.windowMs,
    };
    rateLimitStore.set(key, entry);
  }

  // Check if limit exceeded
  if (entry.count >= opts.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      retryAfter: Math.ceil((entry.resetTime - now) / 1000),
    };
  }

  // Increment count
  entry.count++;

  return {
    allowed: true,
    remaining: opts.maxRequests - entry.count,
    resetTime: entry.resetTime,
  };
}

/**
 * Decrement rate limit count (for failed requests if configured)
 */
export function decrementRateLimit(key: string): void {
  const entry = rateLimitStore.get(key);
  if (entry && entry.count > 0) {
    entry.count--;
  }
}

/**
 * Reset rate limit for a key
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Get current rate limit status for a key
 */
export function getRateLimitStatus(
  key: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitResult {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    return {
      allowed: true,
      remaining: opts.maxRequests,
      resetTime: now + opts.windowMs,
    };
  }

  return {
    allowed: entry.count < opts.maxRequests,
    remaining: Math.max(0, opts.maxRequests - entry.count),
    resetTime: entry.resetTime,
    retryAfter: entry.count >= opts.maxRequests 
      ? Math.ceil((entry.resetTime - now) / 1000) 
      : undefined,
  };
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
  // Standard API endpoints
  standard: {
    windowMs: 60 * 1000,
    maxRequests: 100,
  },
  // Document upload (more restrictive)
  upload: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Upload rate limit exceeded. Please wait before uploading more files.',
  },
  // Document processing (expensive operation)
  processing: {
    windowMs: 60 * 1000,
    maxRequests: 5,
    message: 'Processing rate limit exceeded. Please wait before processing more documents.',
  },
  // Authentication attempts
  auth: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts. Please try again later.',
  },
  // Admin operations
  admin: {
    windowMs: 60 * 1000,
    maxRequests: 30,
  },
  // Webhook delivery
  webhook: {
    windowMs: 60 * 1000,
    maxRequests: 100,
  },
};

/**
 * Create a rate limiter for tRPC procedures
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  return {
    check: (userId: number | string) => {
      const key = `user:${userId}`;
      return checkRateLimit(key, config);
    },
    checkByIp: (ip: string) => {
      const key = `ip:${ip}`;
      return checkRateLimit(key, config);
    },
    reset: (userId: number | string) => {
      resetRateLimit(`user:${userId}`);
    },
  };
}

/**
 * Rate limit error class
 */
export class RateLimitError extends Error {
  public readonly retryAfter: number;
  public readonly resetTime: number;

  constructor(message: string, retryAfter: number, resetTime: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.resetTime = resetTime;
  }
}

/**
 * Enforce rate limit (throws if exceeded)
 */
export function enforceRateLimit(
  key: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitResult {
  const result = checkRateLimit(key, config);
  
  if (!result.allowed) {
    throw new RateLimitError(
      config.message || DEFAULT_CONFIG.message!,
      result.retryAfter!,
      result.resetTime
    );
  }
  
  return result;
}

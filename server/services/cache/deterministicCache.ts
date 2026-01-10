/**
 * Deterministic Caching Service - PR-3
 * 
 * Implements caching by:
 * - fileHash (document content)
 * - templateHash (template version)
 * - engineVersions (OCR + analyzer versions)
 * 
 * Ensures byte-identical outputs for identical inputs.
 */

import * as crypto from 'crypto';
import { createSafeLogger } from '../../utils/safeLogger';

const logger = createSafeLogger('deterministicCache');

/**
 * Cache key components
 */
export interface CacheKeyComponents {
  fileHash: string;      // SHA-256 of document content
  templateHash: string;  // SHA-256 of template config
  engineVersions: {
    ocr: string;
    analyzer: string;
    extraction: string;
  };
}

/**
 * Cache entry metadata
 */
export interface CacheEntryMetadata {
  cacheKey: string;
  createdAt: string;
  expiresAt: string;
  hitCount: number;
  lastAccessedAt: string;
  sizeBytes: number;
  components: CacheKeyComponents;
}

/**
 * Cache entry with data
 */
export interface CacheEntry<T> {
  data: T;
  metadata: CacheEntryMetadata;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  totalSizeBytes: number;
  evictions: number;
}

/**
 * Performance counters
 */
export interface PerformanceCounters {
  cacheStats: CacheStats;
  processingCounts: {
    ocrPages: number;
    roiChecks: number;
    fieldExtractions: number;
    imageQaChecks: number;
    fusionOperations: number;
  };
  parallelismCaps: {
    maxConcurrentOcrPages: number;
    maxConcurrentRoiChecks: number;
    maxConcurrentFieldExtractions: number;
  };
  timings: {
    totalProcessingMs: number;
    ocrTimeMs: number;
    extractionTimeMs: number;
    fusionTimeMs: number;
    cacheCheckTimeMs: number;
  };
}

/**
 * Parallelism configuration
 */
export interface ParallelismCaps {
  maxConcurrentOcrPages: number;
  maxConcurrentRoiChecks: number;
  maxConcurrentFieldExtractions: number;
  maxConcurrentImageQa: number;
}

/**
 * Default parallelism caps
 */
export const DEFAULT_PARALLELISM_CAPS: ParallelismCaps = {
  maxConcurrentOcrPages: 4,
  maxConcurrentRoiChecks: 8,
  maxConcurrentFieldExtractions: 16,
  maxConcurrentImageQa: 4,
};

/**
 * Cache configuration
 */
export interface CacheConfig {
  maxEntries: number;
  maxSizeBytes: number;
  ttlMs: number;
  enablePersistence: boolean;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxEntries: 1000,
  maxSizeBytes: 500 * 1024 * 1024, // 500MB
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  enablePersistence: false,
};

/**
 * In-memory cache store
 */
class CacheStore<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalEntries: 0,
    totalSizeBytes: 0,
    evictions: 0,
  };
  private config: CacheConfig;

  constructor(config: CacheConfig = DEFAULT_CACHE_CONFIG) {
    this.config = config;
  }

  /**
   * Generate deterministic cache key from components
   */
  static generateKey(components: CacheKeyComponents): string {
    const keyInput = JSON.stringify({
      fileHash: components.fileHash,
      templateHash: components.templateHash,
      engineVersions: components.engineVersions,
    });
    return crypto.createHash('sha256').update(keyInput).digest('hex');
  }

  /**
   * Get entry from cache
   */
  get(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check expiry
    if (new Date(entry.metadata.expiresAt) < new Date()) {
      this.cache.delete(key);
      this.stats.totalEntries--;
      this.stats.totalSizeBytes -= entry.metadata.sizeBytes;
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Update hit count and last accessed
    entry.metadata.hitCount++;
    entry.metadata.lastAccessedAt = new Date().toISOString();
    this.stats.hits++;
    this.updateHitRate();

    return entry;
  }

  /**
   * Set entry in cache
   */
  set(key: string, data: T, components: CacheKeyComponents): CacheEntry<T> {
    // Evict if necessary
    while (
      this.cache.size >= this.config.maxEntries ||
      this.stats.totalSizeBytes >= this.config.maxSizeBytes
    ) {
      this.evictOldest();
    }

    const dataString = JSON.stringify(data);
    const sizeBytes = Buffer.byteLength(dataString, 'utf8');

    const now = new Date();
    const entry: CacheEntry<T> = {
      data,
      metadata: {
        cacheKey: key,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + this.config.ttlMs).toISOString(),
        hitCount: 0,
        lastAccessedAt: now.toISOString(),
        sizeBytes,
        components,
      },
    };

    this.cache.set(key, entry);
    this.stats.totalEntries++;
    this.stats.totalSizeBytes += sizeBytes;

    return entry;
  }

  /**
   * Check if key exists in cache (without counting as hit/miss)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check expiry
    if (new Date(entry.metadata.expiresAt) < new Date()) {
      this.cache.delete(key);
      this.stats.totalEntries--;
      this.stats.totalSizeBytes -= entry.metadata.sizeBytes;
      return false;
    }
    
    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.stats.totalEntries--;
      this.stats.totalSizeBytes -= entry.metadata.sizeBytes;
      return true;
    }
    return false;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalEntries: 0,
      totalSizeBytes: 0,
      evictions: this.stats.evictions, // Preserve eviction count
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Evict oldest entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      const accessTime = new Date(entry.metadata.lastAccessedAt).getTime();
      if (accessTime < oldestTime) {
        oldestTime = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      if (entry) {
        this.cache.delete(oldestKey);
        this.stats.totalEntries--;
        this.stats.totalSizeBytes -= entry.metadata.sizeBytes;
        this.stats.evictions++;
      }
    }
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}

/**
 * Result cache for document processing
 */
export interface ProcessingResult {
  documentId: string;
  extractedFields: Record<string, unknown>;
  fusionResults: Record<string, unknown>;
  validationTrace: unknown;
  processingTimeMs: number;
}

/**
 * Singleton cache instance
 */
let processingCache: CacheStore<ProcessingResult> | null = null;

/**
 * Get or create the processing cache
 */
export function getProcessingCache(config?: CacheConfig): CacheStore<ProcessingResult> {
  if (!processingCache) {
    processingCache = new CacheStore<ProcessingResult>(config);
  }
  return processingCache;
}

/**
 * Reset cache (for testing)
 */
export function resetCache(): void {
  processingCache = null;
}

/**
 * Compute file hash
 */
export function computeFileHash(content: Buffer | string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Compute template hash
 */
export function computeTemplateHash(templateConfig: unknown): string {
  const normalized = JSON.stringify(templateConfig);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Get current engine versions
 */
export function getCurrentEngineVersions(): CacheKeyComponents['engineVersions'] {
  return {
    ocr: '1.0.0',
    analyzer: '1.0.0',
    extraction: '1.0.0',
  };
}

/**
 * Build cache key components
 */
export function buildCacheKeyComponents(
  fileContent: Buffer | string,
  templateConfig: unknown
): CacheKeyComponents {
  return {
    fileHash: computeFileHash(fileContent),
    templateHash: computeTemplateHash(templateConfig),
    engineVersions: getCurrentEngineVersions(),
  };
}

/**
 * Performance counter tracker
 */
class PerformanceTracker {
  private counters: PerformanceCounters;
  private startTime: number;

  constructor(caps: ParallelismCaps = DEFAULT_PARALLELISM_CAPS) {
    this.startTime = Date.now();
    this.counters = {
      cacheStats: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        totalEntries: 0,
        totalSizeBytes: 0,
        evictions: 0,
      },
      processingCounts: {
        ocrPages: 0,
        roiChecks: 0,
        fieldExtractions: 0,
        imageQaChecks: 0,
        fusionOperations: 0,
      },
      parallelismCaps: {
        maxConcurrentOcrPages: caps.maxConcurrentOcrPages,
        maxConcurrentRoiChecks: caps.maxConcurrentRoiChecks,
        maxConcurrentFieldExtractions: caps.maxConcurrentFieldExtractions,
      },
      timings: {
        totalProcessingMs: 0,
        ocrTimeMs: 0,
        extractionTimeMs: 0,
        fusionTimeMs: 0,
        cacheCheckTimeMs: 0,
      },
    };
  }

  incrementOcrPages(count: number = 1): void {
    this.counters.processingCounts.ocrPages += count;
  }

  incrementRoiChecks(count: number = 1): void {
    this.counters.processingCounts.roiChecks += count;
  }

  incrementFieldExtractions(count: number = 1): void {
    this.counters.processingCounts.fieldExtractions += count;
  }

  incrementImageQaChecks(count: number = 1): void {
    this.counters.processingCounts.imageQaChecks += count;
  }

  incrementFusionOperations(count: number = 1): void {
    this.counters.processingCounts.fusionOperations += count;
  }

  recordOcrTime(ms: number): void {
    this.counters.timings.ocrTimeMs += ms;
  }

  recordExtractionTime(ms: number): void {
    this.counters.timings.extractionTimeMs += ms;
  }

  recordFusionTime(ms: number): void {
    this.counters.timings.fusionTimeMs += ms;
  }

  recordCacheCheckTime(ms: number): void {
    this.counters.timings.cacheCheckTimeMs += ms;
  }

  updateCacheStats(stats: CacheStats): void {
    this.counters.cacheStats = { ...stats };
  }

  finalize(): PerformanceCounters {
    this.counters.timings.totalProcessingMs = Date.now() - this.startTime;
    return { ...this.counters };
  }
}

/**
 * Create a new performance tracker
 */
export function createPerformanceTracker(caps?: ParallelismCaps): PerformanceTracker {
  return new PerformanceTracker(caps);
}

/**
 * Try to get cached result
 */
export function getCachedResult(
  fileContent: Buffer | string,
  templateConfig: unknown
): { result: ProcessingResult | null; fromCache: boolean; cacheCheckTimeMs: number } {
  const startTime = Date.now();
  
  const components = buildCacheKeyComponents(fileContent, templateConfig);
  const cacheKey = CacheStore.generateKey(components);
  
  const cache = getProcessingCache();
  const entry = cache.get(cacheKey);
  
  const cacheCheckTimeMs = Date.now() - startTime;
  
  if (entry) {
    logger.info('Cache hit', {
      cacheKey: cacheKey.substring(0, 16) + '...',
      hitCount: entry.metadata.hitCount,
      cacheCheckTimeMs,
    });
    return { result: entry.data, fromCache: true, cacheCheckTimeMs };
  }
  
  logger.info('Cache miss', {
    cacheKey: cacheKey.substring(0, 16) + '...',
    cacheCheckTimeMs,
  });
  return { result: null, fromCache: false, cacheCheckTimeMs };
}

/**
 * Store result in cache
 */
export function cacheResult(
  fileContent: Buffer | string,
  templateConfig: unknown,
  result: ProcessingResult
): CacheEntryMetadata {
  const components = buildCacheKeyComponents(fileContent, templateConfig);
  const cacheKey = CacheStore.generateKey(components);
  
  const cache = getProcessingCache();
  const entry = cache.set(cacheKey, result, components);
  
  logger.info('Result cached', {
    cacheKey: cacheKey.substring(0, 16) + '...',
    sizeBytes: entry.metadata.sizeBytes,
    expiresAt: entry.metadata.expiresAt,
  });
  
  return entry.metadata;
}

/**
 * Generate cache key for external use
 */
export function generateCacheKey(components: CacheKeyComponents): string {
  return CacheStore.generateKey(components);
}

// Export CacheStore for testing
export { CacheStore };

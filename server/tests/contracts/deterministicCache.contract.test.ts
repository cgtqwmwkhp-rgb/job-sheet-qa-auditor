/**
 * Deterministic Cache Service - Contract Tests
 * 
 * Tests for:
 * - Cache hit returns byte-identical outputs
 * - Cache key generation is deterministic
 * - Parallelism caps are respected
 * - Performance counters track correctly
 * - Cache eviction works correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CacheStore,
  getProcessingCache,
  resetCache,
  getCachedResult,
  cacheResult,
  computeFileHash,
  computeTemplateHash,
  buildCacheKeyComponents,
  generateCacheKey,
  getCurrentEngineVersions,
  createPerformanceTracker,
  DEFAULT_PARALLELISM_CAPS,
  DEFAULT_CACHE_CONFIG,
  type CacheKeyComponents,
  type ProcessingResult,
  type CacheConfig,
} from '../../services/cache';

describe('Deterministic Cache Service', () => {
  beforeEach(() => {
    resetCache();
  });

  afterEach(() => {
    resetCache();
  });

  describe('Cache key generation', () => {
    it('should generate deterministic keys from same components', () => {
      const components: CacheKeyComponents = {
        fileHash: 'abc123',
        templateHash: 'template456',
        engineVersions: { ocr: '1.0.0', analyzer: '1.0.0', extraction: '1.0.0' },
      };

      const key1 = generateCacheKey(components);
      const key2 = generateCacheKey(components);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    });

    it('should generate different keys for different file hashes', () => {
      const base: CacheKeyComponents = {
        fileHash: 'file1',
        templateHash: 'template1',
        engineVersions: { ocr: '1.0.0', analyzer: '1.0.0', extraction: '1.0.0' },
      };

      const key1 = generateCacheKey(base);
      const key2 = generateCacheKey({ ...base, fileHash: 'file2' });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different template hashes', () => {
      const base: CacheKeyComponents = {
        fileHash: 'file1',
        templateHash: 'template1',
        engineVersions: { ocr: '1.0.0', analyzer: '1.0.0', extraction: '1.0.0' },
      };

      const key1 = generateCacheKey(base);
      const key2 = generateCacheKey({ ...base, templateHash: 'template2' });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different engine versions', () => {
      const base: CacheKeyComponents = {
        fileHash: 'file1',
        templateHash: 'template1',
        engineVersions: { ocr: '1.0.0', analyzer: '1.0.0', extraction: '1.0.0' },
      };

      const key1 = generateCacheKey(base);
      const key2 = generateCacheKey({
        ...base,
        engineVersions: { ...base.engineVersions, ocr: '1.0.1' },
      });

      expect(key1).not.toBe(key2);
    });
  });

  describe('Hash computation', () => {
    it('should compute deterministic file hash', () => {
      const content = Buffer.from('test document content');
      const hash1 = computeFileHash(content);
      const hash2 = computeFileHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should compute deterministic template hash', () => {
      const template = { name: 'TestTemplate', version: 1, fields: ['a', 'b'] };
      const hash1 = computeTemplateHash(template);
      const hash2 = computeTemplateHash(template);

      expect(hash1).toBe(hash2);
    });

    it('should compute different hashes for different content', () => {
      const hash1 = computeFileHash(Buffer.from('content1'));
      const hash2 = computeFileHash(Buffer.from('content2'));

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('CacheStore operations', () => {
    it('should store and retrieve entries', () => {
      const config: CacheConfig = { ...DEFAULT_CACHE_CONFIG, maxEntries: 10 };
      const store = new CacheStore<ProcessingResult>(config);
      
      const components: CacheKeyComponents = {
        fileHash: 'test-file',
        templateHash: 'test-template',
        engineVersions: getCurrentEngineVersions(),
      };
      const key = CacheStore.generateKey(components);
      
      const result: ProcessingResult = {
        documentId: 'doc-123',
        extractedFields: { field1: 'value1' },
        fusionResults: {},
        validationTrace: {},
        processingTimeMs: 100,
      };

      store.set(key, result, components);
      const entry = store.get(key);

      expect(entry).not.toBeNull();
      expect(entry!.data).toEqual(result);
      expect(entry!.metadata.cacheKey).toBe(key);
      expect(entry!.metadata.hitCount).toBe(1);
    });

    it('should return null for missing entries', () => {
      const store = new CacheStore<ProcessingResult>();
      const entry = store.get('nonexistent-key');

      expect(entry).toBeNull();
    });

    it('should track hit/miss statistics', () => {
      const store = new CacheStore<ProcessingResult>();
      const components: CacheKeyComponents = {
        fileHash: 'test',
        templateHash: 'test',
        engineVersions: getCurrentEngineVersions(),
      };
      const key = CacheStore.generateKey(components);

      // Miss
      store.get('nonexistent');
      expect(store.getStats().misses).toBe(1);
      expect(store.getStats().hits).toBe(0);

      // Store and hit
      store.set(key, {} as ProcessingResult, components);
      store.get(key);
      expect(store.getStats().hits).toBe(1);
      expect(store.getStats().hitRate).toBeCloseTo(0.5, 2);
    });

    it('should evict entries when cache is full', async () => {
      const config: CacheConfig = { ...DEFAULT_CACHE_CONFIG, maxEntries: 2 };
      const store = new CacheStore<ProcessingResult>(config);

      const components1: CacheKeyComponents = {
        fileHash: 'file1',
        templateHash: 'template',
        engineVersions: getCurrentEngineVersions(),
      };
      const components2: CacheKeyComponents = {
        fileHash: 'file2',
        templateHash: 'template',
        engineVersions: getCurrentEngineVersions(),
      };
      const components3: CacheKeyComponents = {
        fileHash: 'file3',
        templateHash: 'template',
        engineVersions: getCurrentEngineVersions(),
      };

      const key1 = CacheStore.generateKey(components1);
      const key2 = CacheStore.generateKey(components2);
      const key3 = CacheStore.generateKey(components3);

      store.set(key1, { documentId: 'doc1' } as ProcessingResult, components1);
      store.set(key2, { documentId: 'doc2' } as ProcessingResult, components2);
      
      // Add key3 - should trigger eviction of one entry
      store.set(key3, { documentId: 'doc3' } as ProcessingResult, components3);

      // Verify eviction occurred and we still have 2 entries
      expect(store.getStats().totalEntries).toBe(2);
      expect(store.getStats().evictions).toBe(1);
      expect(store.has(key3)).toBe(true);
      
      // Either key1 or key2 was evicted (deterministic based on access time)
      const key1Exists = store.has(key1);
      const key2Exists = store.has(key2);
      expect(key1Exists || key2Exists).toBe(true);
      expect(key1Exists && key2Exists).toBe(false);
    });

    it('should expire entries after TTL', () => {
      const config: CacheConfig = { ...DEFAULT_CACHE_CONFIG, ttlMs: 1 }; // 1ms TTL
      const store = new CacheStore<ProcessingResult>(config);
      
      const components: CacheKeyComponents = {
        fileHash: 'test',
        templateHash: 'test',
        engineVersions: getCurrentEngineVersions(),
      };
      const key = CacheStore.generateKey(components);

      store.set(key, {} as ProcessingResult, components);
      
      // Wait for expiry
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const entry = store.get(key);
          expect(entry).toBeNull();
          resolve();
        }, 10);
      });
    });
  });

  describe('Cache hit returns byte-identical outputs', () => {
    it('should return exact same data on cache hit', () => {
      const fileContent = Buffer.from('test document');
      const templateConfig = { name: 'TestTemplate', version: 1 };
      
      const result: ProcessingResult = {
        documentId: 'doc-byte-test',
        extractedFields: { jobRef: 'JOB-123', assetId: 'ASSET-001' },
        fusionResults: { signatureBlock: { present: true, confidence: 0.95 } },
        validationTrace: { fields: [], overallConfidence: 0.9 },
        processingTimeMs: 150,
      };

      // Cache the result
      cacheResult(fileContent, templateConfig, result);

      // Retrieve from cache
      const { result: cachedResult, fromCache } = getCachedResult(fileContent, templateConfig);

      expect(fromCache).toBe(true);
      expect(cachedResult).not.toBeNull();
      
      // Byte-identical comparison via JSON
      expect(JSON.stringify(cachedResult)).toBe(JSON.stringify(result));
    });

    it('should miss cache for different file content', () => {
      const templateConfig = { name: 'TestTemplate' };
      
      const result: ProcessingResult = {
        documentId: 'doc-miss-test',
        extractedFields: {},
        fusionResults: {},
        validationTrace: {},
        processingTimeMs: 100,
      };

      cacheResult(Buffer.from('content1'), templateConfig, result);

      const { fromCache } = getCachedResult(Buffer.from('content2'), templateConfig);
      expect(fromCache).toBe(false);
    });
  });

  describe('Performance tracker', () => {
    it('should track processing counts', () => {
      const tracker = createPerformanceTracker();

      tracker.incrementOcrPages(3);
      tracker.incrementRoiChecks(5);
      tracker.incrementFieldExtractions(6);
      tracker.incrementImageQaChecks(2);
      tracker.incrementFusionOperations(4);

      const counters = tracker.finalize();

      expect(counters.processingCounts.ocrPages).toBe(3);
      expect(counters.processingCounts.roiChecks).toBe(5);
      expect(counters.processingCounts.fieldExtractions).toBe(6);
      expect(counters.processingCounts.imageQaChecks).toBe(2);
      expect(counters.processingCounts.fusionOperations).toBe(4);
    });

    it('should track timing measurements', () => {
      const tracker = createPerformanceTracker();

      tracker.recordOcrTime(100);
      tracker.recordExtractionTime(50);
      tracker.recordFusionTime(25);
      tracker.recordCacheCheckTime(5);

      const counters = tracker.finalize();

      expect(counters.timings.ocrTimeMs).toBe(100);
      expect(counters.timings.extractionTimeMs).toBe(50);
      expect(counters.timings.fusionTimeMs).toBe(25);
      expect(counters.timings.cacheCheckTimeMs).toBe(5);
      // totalProcessingMs can be 0 if finalize() is called immediately
      expect(counters.timings.totalProcessingMs).toBeGreaterThanOrEqual(0);
    });

    it('should include parallelism caps in counters', () => {
      const customCaps = {
        maxConcurrentOcrPages: 8,
        maxConcurrentRoiChecks: 16,
        maxConcurrentFieldExtractions: 32,
        maxConcurrentImageQa: 8,
      };

      const tracker = createPerformanceTracker(customCaps);
      const counters = tracker.finalize();

      expect(counters.parallelismCaps.maxConcurrentOcrPages).toBe(8);
      expect(counters.parallelismCaps.maxConcurrentRoiChecks).toBe(16);
      expect(counters.parallelismCaps.maxConcurrentFieldExtractions).toBe(32);
    });

    it('should update cache stats', () => {
      const tracker = createPerformanceTracker();
      const cacheStats = {
        hits: 10,
        misses: 5,
        hitRate: 0.67,
        totalEntries: 100,
        totalSizeBytes: 50000,
        evictions: 2,
      };

      tracker.updateCacheStats(cacheStats);
      const counters = tracker.finalize();

      expect(counters.cacheStats).toEqual(cacheStats);
    });
  });

  describe('Default configurations', () => {
    it('should have reasonable default parallelism caps', () => {
      expect(DEFAULT_PARALLELISM_CAPS.maxConcurrentOcrPages).toBeGreaterThan(0);
      expect(DEFAULT_PARALLELISM_CAPS.maxConcurrentRoiChecks).toBeGreaterThan(0);
      expect(DEFAULT_PARALLELISM_CAPS.maxConcurrentFieldExtractions).toBeGreaterThan(0);
      expect(DEFAULT_PARALLELISM_CAPS.maxConcurrentImageQa).toBeGreaterThan(0);
    });

    it('should have reasonable default cache config', () => {
      expect(DEFAULT_CACHE_CONFIG.maxEntries).toBeGreaterThan(0);
      expect(DEFAULT_CACHE_CONFIG.maxSizeBytes).toBeGreaterThan(0);
      expect(DEFAULT_CACHE_CONFIG.ttlMs).toBeGreaterThan(0);
    });
  });

  describe('Build cache key components', () => {
    it('should build complete components from file and template', () => {
      const fileContent = Buffer.from('test content');
      const templateConfig = { name: 'Template', version: 1 };

      const components = buildCacheKeyComponents(fileContent, templateConfig);

      expect(components.fileHash).toBeDefined();
      expect(components.templateHash).toBeDefined();
      expect(components.engineVersions).toBeDefined();
      expect(components.engineVersions.ocr).toBeDefined();
      expect(components.engineVersions.analyzer).toBeDefined();
      expect(components.engineVersions.extraction).toBeDefined();
    });
  });

  describe('Singleton cache behavior', () => {
    it('should return same cache instance', () => {
      const cache1 = getProcessingCache();
      const cache2 = getProcessingCache();

      expect(cache1).toBe(cache2);
    });

    it('should reset cache correctly', () => {
      const cache1 = getProcessingCache();
      resetCache();
      const cache2 = getProcessingCache();

      expect(cache1).not.toBe(cache2);
    });
  });
});

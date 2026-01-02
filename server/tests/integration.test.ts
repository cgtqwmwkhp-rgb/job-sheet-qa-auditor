/**
 * Integration Tests for Job Sheet QA Auditor
 * Tests the full OCR → Analysis → DB flow
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateGoldSpec, diffSpecs } from '../utils/specValidator';
import { validateFile, calculateHash, detectFileType, sanitizeFilename } from '../utils/fileValidation';
import { redactString, redactObject, isSensitiveField } from '../utils/piiRedaction';
import { withRetry, CircuitBreaker, CircuitBreakerOpenError } from '../utils/resilience';
import { checkRateLimit, resetRateLimit, RATE_LIMITS } from '../utils/rateLimiter';
import { addToDeadLetterQueue, getFailedJob, getAllFailedJobs, clearDeadLetterQueue, getDLQStats } from '../utils/deadLetterQueue';
import { getDefaultGoldSpec } from '../services/analyzer';

describe('Gold Standard Spec Validation', () => {
  it('should validate a correct spec', () => {
    const spec = getDefaultGoldSpec();
    const result = validateGoldSpec(spec);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject spec without required fields', () => {
    const invalidSpec = {
      name: 'Test Spec',
      // missing version and rules
    };
    
    const result = validateGoldSpec(invalidSpec);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('version'))).toBe(true);
    expect(result.errors.some(e => e.path.includes('rules'))).toBe(true);
  });

  it('should reject spec with invalid version format', () => {
    const invalidSpec = {
      name: 'Test Spec',
      version: 'v1.0', // should be 1.0.0
      rules: [{
        id: 'R-001',
        field: 'Test Field',
        type: 'presence',
        required: true,
        description: 'Test description',
      }],
    };
    
    const result = validateGoldSpec(invalidSpec);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('semantic versioning'))).toBe(true);
  });

  it('should detect duplicate rule IDs', () => {
    const specWithDuplicates = {
      name: 'Test Spec',
      version: '1.0.0',
      rules: [
        { id: 'R-001', field: 'Field 1', type: 'presence', required: true, description: 'Desc 1' },
        { id: 'R-001', field: 'Field 2', type: 'presence', required: true, description: 'Desc 2' },
      ],
    };
    
    const result = validateGoldSpec(specWithDuplicates);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Duplicate rule ID'))).toBe(true);
  });

  it('should require pattern for regex type rules', () => {
    const specWithMissingPattern = {
      name: 'Test Spec',
      version: '1.0.0',
      rules: [{
        id: 'R-001',
        field: 'Serial Number',
        type: 'regex',
        required: true,
        description: 'Must match pattern',
        // missing pattern
      }],
    };
    
    const result = validateGoldSpec(specWithMissingPattern);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Pattern is required'))).toBe(true);
  });

  it('should diff two spec versions correctly', () => {
    const oldSpec = {
      name: 'Test',
      version: '1.0.0',
      rules: [
        { id: 'R-001', field: 'Field 1' },
        { id: 'R-002', field: 'Field 2' },
      ],
    };
    
    const newSpec = {
      name: 'Test',
      version: '1.1.0',
      rules: [
        { id: 'R-001', field: 'Field 1 Modified' }, // modified
        { id: 'R-003', field: 'Field 3' }, // added
        // R-002 removed
      ],
    };
    
    const diff = diffSpecs(oldSpec, newSpec);
    
    expect(diff.added).toContain('R-003');
    expect(diff.removed).toContain('R-002');
    expect(diff.modified).toContain('R-001');
  });
});

describe('File Validation', () => {
  it('should detect PDF magic bytes', () => {
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
    const detected = detectFileType(pdfBuffer);
    
    expect(detected).toBe('application/pdf');
  });

  it('should detect JPEG magic bytes', () => {
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const detected = detectFileType(jpegBuffer);
    
    expect(detected).toBe('image/jpeg');
  });

  it('should detect PNG magic bytes', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const detected = detectFileType(pngBuffer);
    
    expect(detected).toBe('image/png');
  });

  it('should calculate consistent SHA-256 hash', () => {
    const buffer = Buffer.from('test content');
    const hash1 = calculateHash(buffer);
    const hash2 = calculateHash(buffer);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
  });

  it('should validate file size limits', () => {
    const largeBuffer = Buffer.alloc(20 * 1024 * 1024); // 20MB
    const result = validateFile(largeBuffer, 'application/pdf', { maxSizeBytes: 10 * 1024 * 1024 });
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
  });

  it('should sanitize dangerous filenames', () => {
    expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
    const sanitized = sanitizeFilename('file<>:"/\\|?*.pdf');
    expect(sanitized).not.toContain('<');
    expect(sanitized).not.toContain('>');
    expect(sanitizeFilename('...')).toBe('unnamed_file');
    expect(sanitizeFilename('normal-file.pdf')).toBe('normal-file.pdf');
  });

  it('should reject empty files', () => {
    const emptyBuffer = Buffer.alloc(0);
    const result = validateFile(emptyBuffer, 'application/pdf');
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('empty'))).toBe(true);
  });
});

describe('PII Redaction', () => {
  it('should redact email addresses', () => {
    const text = 'Contact john.doe@example.com for more info';
    const redacted = redactString(text);
    
    expect(redacted).not.toContain('john.doe@example.com');
    expect(redacted).toContain('[EMAIL_REDACTED]');
  });

  it('should redact phone numbers', () => {
    const text = 'Call me at 555-123-4567 or (555) 987-6543';
    const redacted = redactString(text);
    
    expect(redacted).not.toContain('555-123-4567');
    expect(redacted).toContain('[PHONE_REDACTED]');
  });

  it('should redact UK phone numbers', () => {
    const text = 'UK number: 020 7946 0958';
    const redacted = redactString(text);
    
    expect(redacted).toContain('[PHONE_REDACTED]');
  });

  it('should redact credit card numbers', () => {
    // Credit card pattern: 4 groups of 4 digits
    const text = 'Card number is 4111111111111111 here';
    const redacted = redactString(text);
    
    // 16 consecutive digits should be redacted
    expect(redacted).toContain('[CARD_REDACTED]');
  });

  it('should identify sensitive field names', () => {
    expect(isSensitiveField('password')).toBe(true);
    expect(isSensitiveField('apikey')).toBe(true);
    expect(isSensitiveField('secret')).toBe(true);
    expect(isSensitiveField('username')).toBe(false);
    expect(isSensitiveField('name')).toBe(false);
  });

  it('should redact sensitive fields in objects', () => {
    const obj = {
      name: 'John Doe',
      password: 'secret123',
      api_key: 'sk-12345',
      email: 'john@example.com',
    };
    
    const redacted = redactObject(obj);
    
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.api_key).toBe('[REDACTED]');
    expect(redacted.name).toBe('John Doe');
    expect(redacted.email).toContain('[EMAIL_REDACTED]');
  });
});

describe('Resilience Patterns', () => {
  it('should retry on transient errors', async () => {
    let attempts = 0;
    
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('ECONNRESET');
          (error as any).code = 'ECONNRESET';
          throw error;
        }
        return 'success';
      },
      { maxRetries: 3, baseDelayMs: 10 }
    );
    
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should not retry on non-retryable errors', async () => {
    let attempts = 0;
    
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('Invalid input');
        },
        { maxRetries: 3, baseDelayMs: 10 }
      )
    ).rejects.toThrow('Invalid input');
    
    expect(attempts).toBe(1);
  });

  it('should open circuit breaker after failures', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 2,
      resetTimeoutMs: 100,
    });
    
    // Fail twice to open circuit
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('Service unavailable');
        });
      } catch (e) {
        // Expected
      }
    }
    
    expect(breaker.getState()).toBe('OPEN');
    
    // Next call should be rejected immediately
    await expect(
      breaker.execute(async () => 'success')
    ).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('should transition to half-open after timeout', async () => {
    const breaker = new CircuitBreaker('test-halfopen', {
      failureThreshold: 1,
      resetTimeoutMs: 50,
      halfOpenRequests: 1,
    });
    
    // Fail to open circuit
    try {
      await breaker.execute(async () => {
        throw new Error('Fail');
      });
    } catch (e) {
      // Expected
    }
    
    expect(breaker.getState()).toBe('OPEN');
    
    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 60));
    
    // Next successful call should close circuit
    const result = await breaker.execute(async () => 'success');
    
    expect(result).toBe('success');
    expect(breaker.getState()).toBe('CLOSED');
  });
});

describe('Rate Limiting', () => {
  beforeAll(() => {
    resetRateLimit('test-user');
  });

  it('should allow requests within limit', () => {
    const result = checkRateLimit('rate-test-1', { maxRequests: 5, windowMs: 60000 });
    
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should block requests exceeding limit', () => {
    const key = 'rate-test-2';
    const config = { maxRequests: 3, windowMs: 60000 };
    
    // Make 3 requests
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, config);
    }
    
    // 4th request should be blocked
    const result = checkRateLimit(key, config);
    
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('should have predefined rate limits', () => {
    expect(RATE_LIMITS.upload.maxRequests).toBeLessThan(RATE_LIMITS.standard.maxRequests);
    expect(RATE_LIMITS.processing.maxRequests).toBeLessThan(RATE_LIMITS.upload.maxRequests);
  });
});

describe('Dead Letter Queue', () => {
  beforeAll(() => {
    clearDeadLetterQueue();
  });

  afterAll(() => {
    clearDeadLetterQueue();
  });

  it('should add failed jobs to DLQ', () => {
    const job = addToDeadLetterQueue(
      123,
      'ocr',
      new Error('OCR service timeout'),
      { correlationId: 'test-corr-1' }
    );
    
    expect(job.id).toBeDefined();
    expect(job.jobSheetId).toBe(123);
    expect(job.stage).toBe('ocr');
    expect(job.error.message).toContain('timeout');
  });

  it('should retrieve failed job by ID', () => {
    const added = addToDeadLetterQueue(456, 'analysis', new Error('Analysis failed'));
    const retrieved = getFailedJob(added.id);
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.jobSheetId).toBe(456);
  });

  it('should mark transient errors as recoverable', () => {
    const recoverableJob = addToDeadLetterQueue(
      789,
      'ocr',
      new Error('ECONNRESET: Connection reset')
    );
    
    expect(recoverableJob.recoverable).toBe(true);
    
    const unrecoverableJob = addToDeadLetterQueue(
      790,
      'ocr',
      new Error('Invalid file format')
    );
    
    expect(unrecoverableJob.recoverable).toBe(false);
  });

  it('should provide accurate DLQ statistics', () => {
    clearDeadLetterQueue();
    
    addToDeadLetterQueue(1, 'ocr', new Error('Error 1'));
    addToDeadLetterQueue(2, 'ocr', new Error('Error 2'));
    addToDeadLetterQueue(3, 'analysis', new Error('Error 3'));
    
    const stats = getDLQStats();
    
    expect(stats.totalFailed).toBe(3);
    expect(stats.byStage['ocr']).toBe(2);
    expect(stats.byStage['analysis']).toBe(1);
  });
});

describe('Determinism Tests', () => {
  it('should produce identical hashes for same content', () => {
    const content = 'Job Sheet #12345\nTechnician: John Doe\nDate: 2024-01-15';
    const buffer = Buffer.from(content);
    
    const hash1 = calculateHash(buffer);
    const hash2 = calculateHash(buffer);
    const hash3 = calculateHash(buffer);
    
    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it('should validate same spec identically', () => {
    const spec = getDefaultGoldSpec();
    
    const result1 = validateGoldSpec(spec);
    const result2 = validateGoldSpec(spec);
    
    expect(result1.valid).toBe(result2.valid);
    expect(result1.errors.length).toBe(result2.errors.length);
  });

  it('should redact PII consistently', () => {
    const text = 'Email: test@example.com, Phone: 555-123-4567';
    
    const redacted1 = redactString(text);
    const redacted2 = redactString(text);
    
    expect(redacted1).toBe(redacted2);
  });
});

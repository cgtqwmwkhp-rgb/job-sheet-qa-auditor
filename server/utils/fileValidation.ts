/**
 * File Validation Utilities
 * Provides magic bytes detection, size limits, and integrity verification
 */

import { createHash } from 'crypto';

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  detectedType?: string;
  hash?: string;
  sizeBytes?: number;
}

export interface FileValidationOptions {
  maxSizeBytes?: number;
  allowedTypes?: string[];
  requireHash?: boolean;
}

// Magic bytes signatures for common file types
const MAGIC_BYTES: Record<string, { signature: number[]; offset: number }[]> = {
  'application/pdf': [
    { signature: [0x25, 0x50, 0x44, 0x46], offset: 0 }, // %PDF
  ],
  'image/jpeg': [
    { signature: [0xFF, 0xD8, 0xFF], offset: 0 },
  ],
  'image/png': [
    { signature: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], offset: 0 },
  ],
  'image/gif': [
    { signature: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], offset: 0 }, // GIF87a
    { signature: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], offset: 0 }, // GIF89a
  ],
  'image/webp': [
    { signature: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF (need to check WEBP at offset 8)
  ],
  'image/tiff': [
    { signature: [0x49, 0x49, 0x2A, 0x00], offset: 0 }, // Little endian
    { signature: [0x4D, 0x4D, 0x00, 0x2A], offset: 0 }, // Big endian
  ],
  'image/bmp': [
    { signature: [0x42, 0x4D], offset: 0 }, // BM
  ],
};

// Default validation options
const DEFAULT_OPTIONS: FileValidationOptions = {
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  allowedTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/tiff',
    'image/bmp',
  ],
  requireHash: true,
};

/**
 * Detect file type from magic bytes
 */
export function detectFileType(buffer: Buffer): string | null {
  for (const [mimeType, signatures] of Object.entries(MAGIC_BYTES)) {
    for (const { signature, offset } of signatures) {
      if (buffer.length < offset + signature.length) {
        continue;
      }

      let matches = true;
      for (let i = 0; i < signature.length; i++) {
        if (buffer[offset + i] !== signature[i]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        // Special case for WEBP - need to verify WEBP signature at offset 8
        if (mimeType === 'image/webp') {
          const webpSignature = [0x57, 0x45, 0x42, 0x50]; // WEBP
          let isWebp = true;
          for (let i = 0; i < webpSignature.length; i++) {
            if (buffer[8 + i] !== webpSignature[i]) {
              isWebp = false;
              break;
            }
          }
          if (!isWebp) continue;
        }
        return mimeType;
      }
    }
  }

  return null;
}

/**
 * Calculate SHA-256 hash of a buffer
 */
export function calculateHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validate a file buffer
 */
export function validateFile(
  buffer: Buffer,
  declaredType: string,
  options: FileValidationOptions = {}
): FileValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: FileValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    sizeBytes: buffer.length,
  };

  // Check file size
  if (opts.maxSizeBytes && buffer.length > opts.maxSizeBytes) {
    result.valid = false;
    result.errors.push(
      `File size (${formatBytes(buffer.length)}) exceeds maximum allowed (${formatBytes(opts.maxSizeBytes)})`
    );
  }

  // Check for empty file
  if (buffer.length === 0) {
    result.valid = false;
    result.errors.push('File is empty');
    return result;
  }

  // Detect actual file type from magic bytes
  const detectedType = detectFileType(buffer);
  result.detectedType = detectedType || 'unknown';

  // Verify declared type matches detected type
  if (detectedType) {
    if (declaredType && !typesMatch(declaredType, detectedType)) {
      result.warnings.push(
        `Declared type (${declaredType}) does not match detected type (${detectedType})`
      );
    }
  } else {
    result.warnings.push('Could not detect file type from magic bytes');
  }

  // Check if type is allowed
  const typeToCheck = detectedType || declaredType;
  if (opts.allowedTypes && typeToCheck) {
    const isAllowed = opts.allowedTypes.some(allowed => 
      typesMatch(typeToCheck, allowed)
    );
    if (!isAllowed) {
      result.valid = false;
      result.errors.push(
        `File type (${typeToCheck}) is not allowed. Allowed types: ${opts.allowedTypes.join(', ')}`
      );
    }
  }

  // Calculate hash if required
  if (opts.requireHash) {
    result.hash = calculateHash(buffer);
  }

  return result;
}

/**
 * Check if two MIME types match (handles variations)
 */
function typesMatch(type1: string, type2: string): boolean {
  const normalize = (t: string) => t.toLowerCase().trim();
  const t1 = normalize(type1);
  const t2 = normalize(type2);

  if (t1 === t2) return true;

  // Handle common variations
  const variations: Record<string, string[]> = {
    'image/jpeg': ['image/jpg'],
    'image/jpg': ['image/jpeg'],
  };

  return variations[t1]?.includes(t2) || variations[t2]?.includes(t1) || false;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Verify file integrity by comparing hashes
 */
export function verifyIntegrity(buffer: Buffer, expectedHash: string): boolean {
  const actualHash = calculateHash(buffer);
  return actualHash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Sanitize filename to prevent path traversal and other attacks
 */
export function sanitizeFilename(filename: string): string {
  // Remove path components
  let sanitized = filename.replace(/^.*[\\/]/, '');
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  // Remove or replace dangerous characters
  sanitized = sanitized.replace(/[<>:"/\\|?*]/g, '_');
  
  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.slice(sanitized.lastIndexOf('.'));
    const name = sanitized.slice(0, 255 - ext.length);
    sanitized = name + ext;
  }
  
  // Ensure we have a valid filename
  if (!sanitized || sanitized === '.') {
    sanitized = 'unnamed_file';
  }
  
  return sanitized;
}

/**
 * Check if a file appears to be a valid document for processing
 */
export function isProcessableDocument(buffer: Buffer): boolean {
  const detectedType = detectFileType(buffer);
  const processableTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff',
  ];
  
  return detectedType !== null && processableTypes.includes(detectedType);
}

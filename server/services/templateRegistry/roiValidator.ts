/**
 * ROI Validator
 * 
 * PR-H: Validates ROI configurations before persistence.
 * Ensures coordinates are normalized (0-1) and page indices are valid.
 */

import type { RoiConfig, RoiRegion } from './types';

/**
 * ROI validation result
 */
export interface RoiValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Predefined ROI region types for job sheets
 */
export const STANDARD_ROI_TYPES = [
  'header',
  'jobReference',
  'assetId',
  'date',
  'expiryDate',
  'tickboxBlock',
  'signatureBlock',
  'customerSignature',
  'engineerSignature',
  'workDescription',
  'partsUsed',
] as const;

export type StandardRoiType = typeof STANDARD_ROI_TYPES[number];

/**
 * Validate a single ROI region
 */
function validateRegion(region: RoiRegion, index: number): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check name
  if (!region.name || region.name.trim().length === 0) {
    errors.push(`Region ${index}: name is required`);
  }

  // Check page
  if (typeof region.page !== 'number' || region.page < 1) {
    errors.push(`Region ${index}: page must be >= 1 (1-indexed)`);
  }

  // Check bounds exist
  if (!region.bounds) {
    errors.push(`Region ${index}: bounds are required`);
    return { errors, warnings };
  }

  // Check normalized coordinates (0-1)
  const { x, y, width, height } = region.bounds;

  if (typeof x !== 'number' || x < 0 || x > 1) {
    errors.push(`Region ${index}: bounds.x must be 0-1 (normalized), got ${x}`);
  }

  if (typeof y !== 'number' || y < 0 || y > 1) {
    errors.push(`Region ${index}: bounds.y must be 0-1 (normalized), got ${y}`);
  }

  if (typeof width !== 'number' || width <= 0 || width > 1) {
    errors.push(`Region ${index}: bounds.width must be 0-1 (normalized), got ${width}`);
  }

  if (typeof height !== 'number' || height <= 0 || height > 1) {
    errors.push(`Region ${index}: bounds.height must be 0-1 (normalized), got ${height}`);
  }

  // Check bounds don't exceed page
  if (x + width > 1.001) { // Allow small floating point error
    warnings.push(`Region ${index}: x + width = ${x + width}, exceeds page boundary`);
  }

  if (y + height > 1.001) {
    warnings.push(`Region ${index}: y + height = ${y + height}, exceeds page boundary`);
  }

  // Check for standard region types
  if (!STANDARD_ROI_TYPES.includes(region.name as StandardRoiType)) {
    warnings.push(`Region ${index}: '${region.name}' is not a standard ROI type`);
  }

  return { errors, warnings };
}

/**
 * Validate a complete ROI configuration
 */
export function validateRoiConfig(roiConfig: RoiConfig): RoiValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check regions array exists
  if (!roiConfig.regions || !Array.isArray(roiConfig.regions)) {
    return {
      valid: false,
      errors: ['regions must be an array'],
      warnings: [],
    };
  }

  // Validate each region
  for (let i = 0; i < roiConfig.regions.length; i++) {
    const result = validateRegion(roiConfig.regions[i], i);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  // Check for duplicate region names
  const names = roiConfig.regions.map(r => r.name);
  const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
  if (duplicates.length > 0) {
    const uniqueDuplicates = Array.from(new Set(duplicates));
    warnings.push(`Duplicate region names: ${uniqueDuplicates.join(', ')}`);
  }

  // Check for overlapping regions (basic check)
  for (let i = 0; i < roiConfig.regions.length; i++) {
    for (let j = i + 1; j < roiConfig.regions.length; j++) {
      const r1 = roiConfig.regions[i];
      const r2 = roiConfig.regions[j];
      
      if (r1.page === r2.page && regionsOverlap(r1.bounds, r2.bounds)) {
        warnings.push(`Regions '${r1.name}' and '${r2.name}' overlap`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if two regions overlap
 */
function regionsOverlap(
  b1: { x: number; y: number; width: number; height: number },
  b2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    b1.x + b1.width < b2.x ||
    b2.x + b2.width < b1.x ||
    b1.y + b1.height < b2.y ||
    b2.y + b2.height < b1.y
  );
}

/**
 * Normalize ROI coordinates (ensure 0-1 range)
 */
export function normalizeRoiConfig(roiConfig: RoiConfig): RoiConfig {
  return {
    regions: roiConfig.regions.map(region => ({
      ...region,
      bounds: {
        x: Math.max(0, Math.min(1, region.bounds.x)),
        y: Math.max(0, Math.min(1, region.bounds.y)),
        width: Math.max(0.01, Math.min(1, region.bounds.width)),
        height: Math.max(0.01, Math.min(1, region.bounds.height)),
      },
    })),
  };
}

/**
 * Create an empty ROI config for a new template
 */
export function createEmptyRoiConfig(): RoiConfig {
  return {
    regions: [],
  };
}

/**
 * Create a standard job sheet ROI template
 */
export function createStandardJobSheetRoi(): RoiConfig {
  return {
    regions: [
      { name: 'header', page: 1, bounds: { x: 0, y: 0, width: 1, height: 0.1 } },
      { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
      { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 } },
      { name: 'date', page: 1, bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 } },
      { name: 'workDescription', page: 1, bounds: { x: 0.05, y: 0.2, width: 0.9, height: 0.4 } },
      { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 } },
    ],
  };
}

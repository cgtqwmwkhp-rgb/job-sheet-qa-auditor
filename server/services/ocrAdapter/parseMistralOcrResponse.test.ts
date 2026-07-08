/**
 * Unit tests for parseMistralOcrResponse (PR-2).
 * Uses the canonical OCR-4 deep fixture — no live API.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  parseMistralOcrResponse,
  pixelCornersToPercent,
} from './parseMistralOcrResponse';
import { resolveDeepFeaturesEnabled, supportsDeepFeatures } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, '../../tests/fixtures/mistral-ocr4-deep-response.json'), 'utf8')
);

describe('parseMistralOcrResponse', () => {
  it('parses fixture into typed pages with blocks and signature', () => {
    const parsed = parseMistralOcrResponse(fixture);

    expect(parsed.pages).toHaveLength(1);
    expect(parsed.model).toBe('mistral-ocr-4-0');

    const page = parsed.pages[0];
    expect(page.pageNumber).toBe(1); // 0-based index → 1-based
    expect(page.markdown).toContain('Job Sheet');
    expect(page.blocks?.length).toBeGreaterThanOrEqual(2);
    expect(page.blocks?.some(b => b.type === 'signature')).toBe(true);
    expect(page.signatures).toHaveLength(1);
    expect(page.signatures![0].isIllegible).toBe(true);
    expect(page.confidenceScores?.averagePageConfidence).toBeCloseTo(0.91);
    expect(page.confidenceScores?.wordConfidenceScores?.length).toBeGreaterThan(0);
  });

  it('normalizes pixel corners to percent bbox', () => {
    const bbox = pixelCornersToPercent(
      { topLeftX: 100, topLeftY: 200, bottomRightX: 300, bottomRightY: 400 },
      { width: 1700, height: 2200 }
    );

    expect(bbox).toBeDefined();
    expect(bbox!.coordinateSpace).toBe('percent');
    expect(bbox!.x).toBeCloseTo((100 / 1700) * 100);
    expect(bbox!.y).toBeCloseTo((200 / 2200) * 100);
    expect(bbox!.width).toBeCloseTo((200 / 1700) * 100);
    expect(bbox!.height).toBeCloseTo((200 / 2200) * 100);
  });

  it('returns undefined bbox when dimensions missing', () => {
    const bbox = pixelCornersToPercent({
      topLeftX: 100,
      topLeftY: 200,
      bottomRightX: 300,
      bottomRightY: 400,
    });
    expect(bbox).toBeUndefined();
  });

  it('handles missing blocks and confidence without throwing', () => {
    const shallow = {
      pages: [
        {
          index: 0,
          markdown: 'Hello',
          dimensions: { width: 100, height: 100, dpi: 72 },
        },
      ],
      model: 'mistral-ocr-4-0',
    };

    const parsed = parseMistralOcrResponse(shallow);
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0].blocks).toBeUndefined();
    expect(parsed.pages[0].confidenceScores).toBeUndefined();
    expect(parsed.pages[0].signatures).toBeUndefined();
  });

  it('skips malformed blocks instead of throwing', () => {
    const messy = {
      pages: [
        {
          index: 0,
          markdown: 'x',
          dimensions: { width: 1000, height: 1000, dpi: 72 },
          blocks: [
            null,
            { type: 'text' }, // missing coords — still valid block
            { notABlock: true },
            {
              type: 'signature',
              top_left_x: 10,
              top_left_y: 10,
              bottom_right_x: 50,
              bottom_right_y: 50,
              content: '',
            },
          ],
        },
      ],
    };

    const parsed = parseMistralOcrResponse(messy);
    expect(parsed.pages[0].blocks?.length).toBeGreaterThanOrEqual(1);
    expect(parsed.pages[0].signatures?.length).toBe(1);
  });

  it('maps 0-based index to 1-based pageNumber', () => {
    const parsed = parseMistralOcrResponse({
      pages: [{ index: 2, markdown: 'p3' }],
    });
    expect(parsed.pages[0].pageNumber).toBe(3);
  });

  it('ignores deep fields when includeDeepFeatures is false', () => {
    const parsed = parseMistralOcrResponse(fixture, { includeDeepFeatures: false });
    expect(parsed.pages[0].blocks).toBeUndefined();
    expect(parsed.pages[0].confidenceScores).toBeUndefined();
    expect(parsed.pages[0].markdown).toContain('Job Sheet');
  });

  it('attaches percent bbox on blocks when dimensions present', () => {
    const parsed = parseMistralOcrResponse(fixture);
    const sig = parsed.pages[0].blocks?.find(b => b.type === 'signature');
    expect(sig?.boundingBox).toBeDefined();
    expect(sig!.boundingBox!.coordinateSpace).toBe('percent');
    expect(sig!.boundingBox!.x).toBeGreaterThan(0);
    expect(sig!.boundingBox!.y).toBeGreaterThan(0);
  });
});

describe('deep feature gating helpers', () => {
  it('supportsDeepFeatures detects mistral-ocr-4 models', () => {
    expect(supportsDeepFeatures('mistral-ocr-4-0')).toBe(true);
    expect(supportsDeepFeatures('mistral-ocr-2503')).toBe(false);
  });

  it('resolveDeepFeaturesEnabled defaults on for OCR-4', () => {
    expect(resolveDeepFeaturesEnabled('mistral-ocr-4-0', undefined)).toBe(true);
    expect(resolveDeepFeaturesEnabled('mistral-ocr-2503', undefined)).toBe(false);
    expect(resolveDeepFeaturesEnabled('mistral-ocr-4-0', 'false')).toBe(false);
    expect(resolveDeepFeaturesEnabled('mistral-ocr-2503', 'true')).toBe(true);
  });
});

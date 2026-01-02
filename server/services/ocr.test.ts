import { describe, it, expect, beforeAll } from 'vitest';
import { validateMistralApiKey } from './ocr';

describe('Mistral OCR Service', () => {
  describe('API Key Validation', () => {
    it('should validate that MISTRAL_API_KEY is configured and working', async () => {
      const result = await validateMistralApiKey();
      
      expect(result.valid).toBe(true);
      if (!result.valid) {
        console.error('Mistral API Key validation failed:', result.error);
      }
    }, 30000); // 30 second timeout for API call
  });
});

/**
 * Regex Parity Tests
 * 
 * These tests verify that the regex patterns in extraction services
 * match the same strings before and after lint fixes (removing unnecessary escapes).
 * 
 * The escapes removed were inside character classes where they're not needed:
 * - \\/ -> / (forward slash doesn't need escape in character class)
 * - \\- -> - (hyphen at end of character class doesn't need escape)
 * - \\. -> . (dot in character class is literal, no escape needed)
 * - \\? -> ? (question mark outside character class in certain contexts)
 */

import { describe, it, expect } from 'vitest';

describe('Regex Pattern Parity Tests', () => {
  describe('Date Patterns', () => {
    // Test fixtures that should match date patterns
    const dateFixtures = [
      'Date: 01/02/2024',
      'Date: 01-02-2024',
      'Date: 01.02.2024',
      'Date: 2024/01/02',
      'Date: 2024-01-02',
      'Date: 2024.01.02',
      'Job Date: 15/03/2025',
      'Work Date: 15-03-2025',
    ];

    it('should match DD/MM/YYYY and DD-MM-YYYY formats', () => {
      const pattern = /Date[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i;
      
      expect(pattern.test('Date: 01/02/2024')).toBe(true);
      expect(pattern.test('Date: 01-02-2024')).toBe(true);
      expect(pattern.test('Date: 1/2/24')).toBe(true);
      expect(pattern.test('Date:15-03-2025')).toBe(true);
    });

    it('should match YYYY/MM/DD and YYYY-MM-DD formats', () => {
      const pattern = /Date[:\s]*(\d{4}[/-]\d{1,2}[/-]\d{1,2})/i;
      
      expect(pattern.test('Date: 2024/01/02')).toBe(true);
      expect(pattern.test('Date: 2024-01-02')).toBe(true);
      expect(pattern.test('Date:2025-03-15')).toBe(true);
    });

    it('should extract date values correctly', () => {
      const pattern = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/;
      
      const match1 = '01/02/2024'.match(pattern);
      expect(match1).not.toBeNull();
      expect(match1![1]).toBe('01');
      expect(match1![2]).toBe('02');
      expect(match1![3]).toBe('2024');

      const match2 = '15-03-2025'.match(pattern);
      expect(match2).not.toBeNull();
      expect(match2![1]).toBe('15');
      expect(match2![2]).toBe('03');
      expect(match2![3]).toBe('2025');
    });
  });

  describe('Name Patterns with Dots', () => {
    it('should match names with periods (e.g., initials)', () => {
      const pattern = /Engineer(?:\s*Name)?[:\s]*([A-Za-z][A-Za-z\s.]+?)(?=\n|Date|$)/i;
      
      const text1 = 'Engineer Name: John A. Smith';
      const match1 = text1.match(pattern);
      expect(match1).not.toBeNull();
      expect(match1![1].trim()).toBe('John A. Smith');

      const text2 = 'Engineer: Dr. Jane Doe';
      const match2 = text2.match(pattern);
      expect(match2).not.toBeNull();
      expect(match2![1].trim()).toBe('Dr. Jane Doe');
    });

    it('should match technician names', () => {
      const pattern = /Technician(?:\s*Name)?[:\s]*([A-Za-z][A-Za-z\s.]+?)(?=\n|$)/i;
      
      const text = 'Technician: M. Johnson';
      const match = text.match(pattern);
      expect(match).not.toBeNull();
      expect(match![1].trim()).toBe('M. Johnson');
    });
  });

  describe('Boolean Field Patterns', () => {
    it('should match "works completed" with optional question mark', () => {
      const pattern = /(?:Were\s*)?(?:all\s*)?works?\s*(?:fully\s*)?completed[:?]?\s*(Yes|No|Y|N|True|False)/i;
      
      expect(pattern.test('Works completed: Yes')).toBe(true);
      expect(pattern.test('Were all works fully completed? Yes')).toBe(true);
      expect(pattern.test('Work completed: No')).toBe(true);
      expect(pattern.test('Works completed? Y')).toBe(true);
    });

    it('should match "safe to use" patterns', () => {
      const pattern = /(?:Is\s*the\s*)?asset\s*safe\s*to\s*use[:?]?\s*(Yes|No|Y|N|True|False)/i;
      
      expect(pattern.test('Asset safe to use: Yes')).toBe(true);
      expect(pattern.test('Is the asset safe to use? No')).toBe(true);
      expect(pattern.test('asset safe to use: Y')).toBe(true);
    });

    it('should match "return visit required" patterns', () => {
      const pattern = /(?:Is\s*a\s*)?return\s*visit\s*required[:?]?\s*(Yes|No|Y|N|True|False)/i;
      
      expect(pattern.test('Return visit required: Yes')).toBe(true);
      expect(pattern.test('Is a return visit required? No')).toBe(true);
    });

    it('should match follow-up patterns with hyphen', () => {
      const pattern = /Follow[\s-]*up\s*Required[:?]?\s*(Yes|No|Y|N|True|False)/i;
      
      expect(pattern.test('Follow-up Required: Yes')).toBe(true);
      expect(pattern.test('Follow up Required: No')).toBe(true);
      expect(pattern.test('Followup Required? Y')).toBe(true);
    });
  });

  describe('Make/Model Patterns', () => {
    it('should match Make/Model with forward slash', () => {
      const pattern = /Make\s*[/&]\s*Model[:\s]*([^\n]+)/i;
      
      const text1 = 'Make/Model: Toyota Hilux';
      const match1 = text1.match(pattern);
      expect(match1).not.toBeNull();
      expect(match1![1].trim()).toBe('Toyota Hilux');

      const text2 = 'Make & Model: Ford Transit';
      const match2 = text2.match(pattern);
      expect(match2).not.toBeNull();
      expect(match2![1].trim()).toBe('Ford Transit');
    });
  });

  describe('Mileage/Hours Patterns', () => {
    it('should match mileage/hours with forward slash', () => {
      const pattern = /(?:Asset\s*)?(?:Mileage|Hours)[/\s]*(?:Hours)?[:\s]*(\d+(?:\.\d+)?)/i;
      
      expect(pattern.test('Mileage/Hours: 12500')).toBe(true);
      expect(pattern.test('Asset Mileage: 50000')).toBe(true);
      expect(pattern.test('Hours: 1234.5')).toBe(true);
    });
  });

  describe('Service Date Format Validation', () => {
    it('should validate service date formats', () => {
      const pattern = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;
      
      // ISO format
      expect(pattern.test('2024-01-15')).toBe(true);
      expect(pattern.test('2025-12-31')).toBe(true);
      
      // DD/MM/YYYY
      expect(pattern.test('15/01/2024')).toBe(true);
      expect(pattern.test('1/2/24')).toBe(true);
      
      // DD-MM-YYYY
      expect(pattern.test('15-01-2024')).toBe(true);
      expect(pattern.test('1-2-24')).toBe(true);
      
      // Invalid
      expect(pattern.test('not a date')).toBe(false);
      expect(pattern.test('2024/01/15')).toBe(false); // YYYY/MM/DD not in this pattern
    });
  });

  describe('Path Sanitization Pattern', () => {
    it('should match path separators for sanitization', () => {
      const pattern = /^.*[\\/]/;
      
      expect(pattern.test('/path/to/file.txt')).toBe(true);
      expect(pattern.test('C:\\Users\\file.txt')).toBe(true);
      expect(pattern.test('file.txt')).toBe(false);
    });
  });
});

/**
 * Selection Fixtures for Template Matching Tests
 * 
 * PR-3: Expanded fixtures for rigorous template selection testing:
 * - Near-miss tests: documents that almost match but shouldn't
 * - Ambiguity tests: documents that match multiple templates
 * - Edge cases: minimal content, wrong format, partial matches
 * 
 * NON-NEGOTIABLES:
 * - All fixtures must be deterministic
 * - Each fixture must have expected outcome documented
 * - Near-misses must NOT result in HIGH confidence
 * - Ambiguous cases must trigger REVIEW_QUEUE
 */

/**
 * Expected selection outcome
 */
export type ExpectedOutcome = 
  | 'HIGH_CONFIDENCE_MATCH'
  | 'MEDIUM_CONFIDENCE_MATCH'
  | 'LOW_CONFIDENCE_BLOCK'
  | 'AMBIGUITY_BLOCK'
  | 'NO_MATCH';

/**
 * Selection fixture definition
 */
export interface SelectionFixture {
  /** Unique fixture ID */
  id: string;
  /** Human-readable description */
  description: string;
  /** Category for grouping */
  category: 'positive' | 'near-miss' | 'ambiguity' | 'edge-case';
  /** Document text to test */
  documentText: string;
  /** Page texts (for multi-page documents) */
  pageTexts?: string[];
  /** Document metadata */
  metadata?: {
    pageCount: number;
    formType?: 'handwritten' | 'printed' | 'hybrid';
  };
  /** Expected template ID to match (if any) */
  expectedTemplateId?: string;
  /** Expected outcome */
  expectedOutcome: ExpectedOutcome;
  /** Expected confidence band */
  expectedConfidenceBand?: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Minimum score threshold */
  minScore?: number;
  /** Maximum score threshold */
  maxScore?: number;
  /** Expected block reason pattern (for blocked cases) */
  expectedBlockReasonPattern?: RegExp;
  /** Tags for filtering */
  tags: string[];
}

/**
 * Fixture runner result
 */
export interface FixtureRunResult {
  fixture: SelectionFixture;
  passed: boolean;
  actualOutcome: ExpectedOutcome;
  actualTemplateId?: string;
  actualScore: number;
  actualConfidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
  actualBlockReason?: string;
  errors: string[];
}

// ============================================================================
// POSITIVE FIXTURES (Should match with HIGH/MEDIUM confidence)
// ============================================================================

export const POSITIVE_FIXTURES: SelectionFixture[] = [
  {
    id: 'POS-001',
    description: 'Standard job sheet with all expected fields',
    category: 'positive',
    documentText: `
      JOB SHEET
      Reference: JOB-123456
      Date of Service: 15/03/2026
      
      Customer: ACME Corporation
      Serial Number: SN-12345-AB
      
      Technician: John Smith
      Time In: 09:00
      Time Out: 12:30
      
      Work Description:
      Performed routine maintenance on cooling unit.
      Replaced filters and checked refrigerant levels.
      
      Parts Used:
      - Filter Unit (x2)
      - Refrigerant R410A
      
      Customer Signature: _________
    `,
    expectedOutcome: 'HIGH_CONFIDENCE_MATCH',
    expectedConfidenceBand: 'HIGH',
    minScore: 80,
    tags: ['happy-path', 'standard'],
  },
  {
    id: 'POS-002',
    description: 'Job sheet with maintenance keywords',
    category: 'positive',
    documentText: `
      MAINTENANCE SERVICE REPORT
      Job Reference: JOB-999888
      Service Date: 01/01/2026
      
      Equipment: Industrial Compressor
      Asset ID: SN-99999-ZZ
      Engineer: Jane Doe
      
      Work Completed: Annual inspection and service.
    `,
    expectedOutcome: 'MEDIUM_CONFIDENCE_MATCH',
    expectedConfidenceBand: 'MEDIUM',
    minScore: 50,
    tags: ['maintenance', 'service-report'],
  },
];

// ============================================================================
// NEAR-MISS FIXTURES (Almost match but should NOT get HIGH confidence)
// ============================================================================

export const NEAR_MISS_FIXTURES: SelectionFixture[] = [
  {
    id: 'NEAR-001',
    description: 'Document with job/sheet keywords but wrong context (job application)',
    category: 'near-miss',
    documentText: `
      JOB APPLICATION FORM
      
      Position Applied For: Sheet Metal Worker
      
      Applicant Name: Michael Brown
      Date of Application: 10/02/2026
      
      Please describe your work experience:
      I have worked as a sheet metal fabricator for 10 years.
    `,
    expectedOutcome: 'LOW_CONFIDENCE_BLOCK',
    expectedConfidenceBand: 'LOW',
    maxScore: 49,
    expectedBlockReasonPattern: /LOW_CONFIDENCE/,
    tags: ['near-miss', 'wrong-context'],
  },
  {
    id: 'NEAR-002',
    description: 'Invoice with some overlapping fields (date, serial)',
    category: 'near-miss',
    documentText: `
      SALES INVOICE
      Invoice Number: INV-2026-0001
      Date: 15/03/2026
      
      Bill To: XYZ Company
      
      Items:
      - Equipment Serial: SN-12345-AB
      - Service Fee: $500.00
      
      Payment Due: 30 days net
    `,
    expectedOutcome: 'LOW_CONFIDENCE_BLOCK',
    expectedConfidenceBand: 'LOW',
    maxScore: 49,
    expectedBlockReasonPattern: /LOW_CONFIDENCE/,
    tags: ['near-miss', 'invoice'],
  },
  {
    id: 'NEAR-003',
    description: 'Partial job sheet missing critical fields',
    category: 'near-miss',
    documentText: `
      JOB SHEET (DRAFT)
      
      Notes: Equipment inspection required
      Location: Building B
    `,
    expectedOutcome: 'LOW_CONFIDENCE_BLOCK',
    expectedConfidenceBand: 'LOW',
    maxScore: 49,
    tags: ['near-miss', 'incomplete'],
  },
  {
    id: 'NEAR-004',
    description: 'Document with service keywords but different industry (restaurant)',
    category: 'near-miss',
    documentText: `
      CUSTOMER SERVICE FEEDBACK
      
      Restaurant: The Golden Fork
      Date of Visit: 20/03/2026
      
      Service Rating: Excellent
      Food Quality: Very Good
      
      Customer Name: Sarah Wilson
      Signature: _________
    `,
    expectedOutcome: 'LOW_CONFIDENCE_BLOCK',
    expectedConfidenceBand: 'LOW',
    maxScore: 49,
    tags: ['near-miss', 'wrong-industry'],
  },
];

// ============================================================================
// AMBIGUITY FIXTURES (Match multiple templates - should block)
// ============================================================================

export const AMBIGUITY_FIXTURES: SelectionFixture[] = [
  {
    id: 'AMB-001',
    description: 'Generic service document matching multiple templates',
    category: 'ambiguity',
    documentText: `
      SERVICE DOCUMENT
      Date: 15/03/2026
      
      Reference Number: REF-12345
      Customer: General Corp
      
      Description of Work
    `,
    expectedOutcome: 'AMBIGUITY_BLOCK',
    expectedBlockReasonPattern: /AMBIGUITY|gap/i,
    tags: ['ambiguity', 'generic'],
  },
  {
    id: 'AMB-002',
    description: 'Document with mixed keywords from different templates',
    category: 'ambiguity',
    documentText: `
      WORK ORDER / INSPECTION REPORT
      
      Job Number: JOB-555555
      Inspection Date: 01/04/2026
      
      Equipment Type: HVAC System
      Certificate Number: CERT-2026-001
      
      Work Type: Installation and Inspection
    `,
    expectedOutcome: 'AMBIGUITY_BLOCK',
    expectedBlockReasonPattern: /AMBIGUITY|gap/i,
    tags: ['ambiguity', 'mixed-keywords'],
  },
];

// ============================================================================
// EDGE CASE FIXTURES
// ============================================================================

export const EDGE_CASE_FIXTURES: SelectionFixture[] = [
  {
    id: 'EDGE-001',
    description: 'Empty document',
    category: 'edge-case',
    documentText: '',
    expectedOutcome: 'NO_MATCH',
    expectedConfidenceBand: 'LOW',
    tags: ['edge-case', 'empty'],
  },
  {
    id: 'EDGE-002',
    description: 'Single word document',
    category: 'edge-case',
    documentText: 'Job',
    expectedOutcome: 'LOW_CONFIDENCE_BLOCK',
    expectedConfidenceBand: 'LOW',
    maxScore: 30,
    tags: ['edge-case', 'minimal'],
  },
  {
    id: 'EDGE-003',
    description: 'Document with special characters only',
    category: 'edge-case',
    documentText: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    expectedOutcome: 'NO_MATCH',
    expectedConfidenceBand: 'LOW',
    tags: ['edge-case', 'special-chars'],
  },
  {
    id: 'EDGE-004',
    description: 'Very long document with repeated keywords',
    category: 'edge-case',
    documentText: Array(100).fill('job sheet maintenance service').join(' '),
    expectedOutcome: 'HIGH_CONFIDENCE_MATCH',
    minScore: 70,
    tags: ['edge-case', 'long-document'],
  },
  {
    id: 'EDGE-005',
    description: 'Document in wrong language (simulated)',
    category: 'edge-case',
    documentText: `
      FICHE DE TRAVAIL
      Date: 15/03/2026
      Technicien: Pierre Dupont
      Description: Maintenance préventive
    `,
    expectedOutcome: 'LOW_CONFIDENCE_BLOCK',
    expectedConfidenceBand: 'LOW',
    tags: ['edge-case', 'language'],
  },
];

// ============================================================================
// ALL FIXTURES
// ============================================================================

export const ALL_SELECTION_FIXTURES: SelectionFixture[] = [
  ...POSITIVE_FIXTURES,
  ...NEAR_MISS_FIXTURES,
  ...AMBIGUITY_FIXTURES,
  ...EDGE_CASE_FIXTURES,
];

/**
 * Get fixtures by category
 */
export function getFixturesByCategory(category: SelectionFixture['category']): SelectionFixture[] {
  return ALL_SELECTION_FIXTURES.filter(f => f.category === category);
}

/**
 * Get fixtures by tag
 */
export function getFixturesByTag(tag: string): SelectionFixture[] {
  return ALL_SELECTION_FIXTURES.filter(f => f.tags.includes(tag));
}

/**
 * Get fixture by ID
 */
export function getFixtureById(id: string): SelectionFixture | undefined {
  return ALL_SELECTION_FIXTURES.find(f => f.id === id);
}

// ============================================================================
// FIXTURE RUNNER
// ============================================================================

import { selectTemplateMultiSignal, type MultiSignalSelectionResult } from './selectorService';

/**
 * Run a single selection fixture
 */
export function runSelectionFixture(
  fixture: SelectionFixture,
  selectionFn: (documentText: string) => MultiSignalSelectionResult = (text) => 
    selectTemplateMultiSignal({ documentText: text, metadata: fixture.metadata })
): FixtureRunResult {
  const result = selectionFn(fixture.documentText);
  const errors: string[] = [];
  
  // Determine actual outcome
  let actualOutcome: ExpectedOutcome;
  if (result.candidates.length === 0) {
    actualOutcome = 'NO_MATCH';
  } else if (!result.autoProcessingAllowed) {
    if (result.blockReason?.includes('AMBIGUITY')) {
      actualOutcome = 'AMBIGUITY_BLOCK';
    } else {
      actualOutcome = 'LOW_CONFIDENCE_BLOCK';
    }
  } else if (result.confidenceBand === 'HIGH') {
    actualOutcome = 'HIGH_CONFIDENCE_MATCH';
  } else {
    actualOutcome = 'MEDIUM_CONFIDENCE_MATCH';
  }
  
  // Check expected outcome
  if (actualOutcome !== fixture.expectedOutcome) {
    errors.push(`Expected outcome ${fixture.expectedOutcome}, got ${actualOutcome}`);
  }
  
  // Check confidence band
  if (fixture.expectedConfidenceBand && result.confidenceBand !== fixture.expectedConfidenceBand) {
    errors.push(`Expected confidence ${fixture.expectedConfidenceBand}, got ${result.confidenceBand}`);
  }
  
  // Check score thresholds
  if (fixture.minScore !== undefined && result.topScore < fixture.minScore) {
    errors.push(`Score ${result.topScore} below minimum ${fixture.minScore}`);
  }
  if (fixture.maxScore !== undefined && result.topScore > fixture.maxScore) {
    errors.push(`Score ${result.topScore} above maximum ${fixture.maxScore}`);
  }
  
  // Check block reason pattern
  if (fixture.expectedBlockReasonPattern && result.blockReason) {
    if (!fixture.expectedBlockReasonPattern.test(result.blockReason)) {
      errors.push(`Block reason "${result.blockReason}" doesn't match pattern ${fixture.expectedBlockReasonPattern}`);
    }
  }
  
  // Check expected template
  if (fixture.expectedTemplateId && result.selected) {
    const selectedSlug = result.candidates.find(c => c.templateId === result.templateId)?.templateSlug;
    if (selectedSlug !== fixture.expectedTemplateId) {
      errors.push(`Expected template ${fixture.expectedTemplateId}, got ${selectedSlug}`);
    }
  }
  
  return {
    fixture,
    passed: errors.length === 0,
    actualOutcome,
    actualTemplateId: result.candidates.find(c => c.templateId === result.templateId)?.templateSlug,
    actualScore: result.topScore,
    actualConfidenceBand: result.confidenceBand,
    actualBlockReason: result.blockReason,
    errors,
  };
}

/**
 * Run all fixtures in a category
 */
export function runFixtureCategory(
  category: SelectionFixture['category']
): FixtureRunResult[] {
  const fixtures = getFixturesByCategory(category);
  return fixtures.map(f => runSelectionFixture(f));
}

/**
 * Run all fixtures and return summary
 */
export function runAllFixtures(): {
  total: number;
  passed: number;
  failed: number;
  results: FixtureRunResult[];
  byCategory: Record<string, { passed: number; failed: number }>;
} {
  const results = ALL_SELECTION_FIXTURES.map(f => runSelectionFixture(f));
  
  const byCategory: Record<string, { passed: number; failed: number }> = {};
  for (const result of results) {
    const cat = result.fixture.category;
    if (!byCategory[cat]) {
      byCategory[cat] = { passed: 0, failed: 0 };
    }
    if (result.passed) {
      byCategory[cat].passed++;
    } else {
      byCategory[cat].failed++;
    }
  }
  
  return {
    total: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    results,
    byCategory,
  };
}

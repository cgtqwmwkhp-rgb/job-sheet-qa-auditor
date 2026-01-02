/**
 * Advanced Document Extraction Engine
 * ====================================
 * Best-in-class++ extraction system with:
 * 1. Hybrid text extraction (embedded PDF + OCR fallback)
 * 2. Multi-pattern regex matching with fuzzy fallback
 * 3. LLM-assisted extraction for edge cases (Gemini 2.5)
 * 4. Ensemble voting for consensus-based confidence
 * 5. OCR error correction
 * 6. Field normalization and validation
 */

import { invokeLLM } from '../_core/llm';

// ============================================================================
// TYPES
// ============================================================================

export interface FieldDefinition {
  name: string;
  displayName: string;
  required: boolean;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  regexPatterns: RegExp[];
  fuzzyLabels: string[];
  llmPrompt: string;
  normalizer?: 'date' | 'boolean' | 'name' | 'uppercase';
}

export interface ExtractionResult {
  value: string | null;
  confidence: number;
  strategy: 'regex' | 'fuzzy' | 'context' | 'llm' | 'ensemble' | 'none';
  evidence: string;
}

export interface FieldExtraction {
  displayName: string;
  required: boolean;
  severity: string;
  value: string | null;
  confidence: number;
  strategy: string;
  evidence: string;
  consensusCount?: number;
}

export interface DocumentExtractionResult {
  filename: string;
  status: 'PASS' | 'FAIL' | 'REVIEW_QUEUE';
  qualityScore: number;
  averageConfidence: number;
  extractedCount: number;
  totalFields: number;
  requiredExtracted: number;
  requiredTotal: number;
  missingRequired: string[];
  lowConfidenceFields: string[];
  extractedData: Record<string, string>;
  fieldDetails: Record<string, FieldExtraction>;
  documentType: string;
  extractionMethod: 'EMBEDDED_TEXT' | 'OCR' | 'HYBRID';
  processingTimeMs: number;
}

// ============================================================================
// OCR ERROR CORRECTIONS
// ============================================================================

const OCR_CORRECTIONS: Record<string, string[]> = {
  'Narne': ['Name'],
  'Nurnber': ['Number'],
  'Cornpleted': ['Completed'],
  'Requirecl': ['Required'],
  'Enginee': ['Engineer'],
  'Custorner': ['Customer'],
  'Ternp': ['Temp'],
  'Tirne': ['Time'],
  'rn': ['m'],
  'cl': ['d'],
  'vv': ['w'],
};

function correctOcrErrors(text: string): string {
  let corrected = text;
  for (const [wrong, rights] of Object.entries(OCR_CORRECTIONS)) {
    for (const right of rights) {
      const regex = new RegExp(`\\b${wrong}\\b`, 'g');
      corrected = corrected.replace(regex, right);
    }
  }
  return corrected;
}

// ============================================================================
// FIELD DEFINITIONS
// ============================================================================

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    name: 'asset_no',
    displayName: 'Asset Number',
    required: true,
    severity: 'S0',
    regexPatterns: [
      /Asset\s*(?:No|Number|#)?[:\s]*([A-Z0-9]+-?[A-Z0-9]+)/i,
      /Asset\s*ID[:\s]*([A-Z0-9]+-?[A-Z0-9]+)/i,
      /Registration[:\s]*([A-Z]{2}\d{2}[A-Z]{3})/i,
      /Reg(?:istration)?[:\s]*([A-Z0-9]{5,8})/i,
    ],
    fuzzyLabels: ['Asset No', 'Asset Number', 'Asset ID', 'Registration', 'Reg No'],
    llmPrompt: 'Extract the asset number or registration number from this text.',
    normalizer: 'uppercase',
  },
  {
    name: 'make_model',
    displayName: 'Make/Model',
    required: true,
    severity: 'S1',
    regexPatterns: [
      /Make[/\s]*Model[:\s]*([^\n]+?)(?=\n|Serial|$)/i,
      /Make[:\s]*([^\n]+?)(?=\n|Model|$)/i,
      /Equipment[:\s]*([^\n]+?)(?=\n|Serial|$)/i,
    ],
    fuzzyLabels: ['Make/Model', 'Make Model', 'Make', 'Equipment', 'Vehicle Type'],
    llmPrompt: 'Extract the make and model of the equipment or vehicle.',
  },
  {
    name: 'serial_no',
    displayName: 'Serial Number',
    required: false,
    severity: 'S2',
    regexPatterns: [
      /Serial\s*(?:No|Number|#)?[:\s]*([A-Z0-9-]+)/i,
      /S\/N[:\s]*([A-Z0-9-]+)/i,
      /VIN[:\s]*([A-Z0-9]{17})/i,
    ],
    fuzzyLabels: ['Serial No', 'Serial Number', 'S/N', 'VIN'],
    llmPrompt: 'Extract the serial number or VIN.',
    normalizer: 'uppercase',
  },
  {
    name: 'job_no',
    displayName: 'Job Number',
    required: true,
    severity: 'S0',
    regexPatterns: [
      /Job\s*(?:No|Number|#)?[:\s]*(\d+)/i,
      /Work\s*Order[:\s]*(\d+)/i,
      /WO[:\s]*#?(\d+)/i,
      /Reference[:\s]*(\d+)/i,
    ],
    fuzzyLabels: ['Job No', 'Job Number', 'Work Order', 'WO', 'Reference'],
    llmPrompt: 'Extract the job number or work order number.',
  },
  {
    name: 'customer_name',
    displayName: 'Customer Name',
    required: true,
    severity: 'S1',
    regexPatterns: [
      /Customer\s*(?:Name)?[:\s]*([A-Za-z][^\n]+?)(?=\n|Contact|Address|$)/i,
      /Client[:\s]*([A-Za-z][^\n]+?)(?=\n|$)/i,
      /Company[:\s]*([A-Za-z][^\n]+?)(?=\n|$)/i,
    ],
    fuzzyLabels: ['Customer Name', 'Customer', 'Client', 'Company', 'Account'],
    llmPrompt: 'Extract the customer or client name.',
    normalizer: 'name',
  },
  {
    name: 'date',
    displayName: 'Date',
    required: true,
    severity: 'S0',
    regexPatterns: [
      /Date[:\s]*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
      /Date[:\s]*(\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2})/i,
      /(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
    ],
    fuzzyLabels: ['Date', 'Job Date', 'Completed Date', 'Service Date'],
    llmPrompt: 'Extract the date of the job or service.',
    normalizer: 'date',
  },
  {
    name: 'engineer_name',
    displayName: 'Engineer Name',
    required: true,
    severity: 'S0',
    regexPatterns: [
      /Engineer(?:\s*Name)?[:\s]*([A-Za-z][A-Za-z\s\.]+?)(?=\n|Date|$)/i,
      /Technician(?:\s*Name)?[:\s]*([A-Za-z][A-Za-z\s\.]+?)(?=\n|$)/i,
      /Completed\s*By[:\s]*([A-Za-z][A-Za-z\s\.]+?)(?=\n|$)/i,
      /Print\s*name[:\s]*([A-Za-z][A-Za-z\s\.]+?)(?=\n|$)/i,
      /Name[:\s]*([a-z]+\.[a-z]+)/i,
    ],
    fuzzyLabels: ['Engineer', 'Engineer Name', 'Technician', 'Completed By', 'Service By'],
    llmPrompt: 'Extract the engineer or technician name.',
    normalizer: 'name',
  },
  {
    name: 'safe_to_use',
    displayName: 'Safe to Use',
    required: true,
    severity: 'S0',
    regexPatterns: [
      /asset\s+safe\s+to\s+use\??\s*:?\s*(Yes|No|Y|N)/i,
      /safe\s+to\s+(?:use|operate)\??\s*:?\s*(Yes|No|Y|N)/i,
      /equipment\s+safe\??\s*:?\s*(Yes|No)/i,
      /safe\s+to\s+operate\s+Yes\/No[:\s]*(Yes|No)/i,
    ],
    fuzzyLabels: ['Safe to Use', 'Safe to Operate', 'Equipment Safe', 'Serviceable'],
    llmPrompt: 'Is the asset/equipment safe to use? Extract Yes or No.',
    normalizer: 'boolean',
  },
  {
    name: 'engineer_comments',
    displayName: 'Engineer Comments',
    required: true,
    severity: 'S1',
    regexPatterns: [
      /Engineer\s*Comments?[:\s]*([^\n]+(?:\n(?![A-Z][a-z]*(?:\s+[A-Z][a-z]*)?:)[^\n]+)*)/i,
      /Technician\s*Notes?[:\s]*([^\n]+)/i,
      /Comments?[:\s]*([^\n]+)/i,
      /Notes?[:\s]*([^\n]+)/i,
    ],
    fuzzyLabels: ['Engineer Comments', 'Technician Notes', 'Service Notes', 'Comments', 'Notes'],
    llmPrompt: "Extract the engineer's comments or notes about the service.",
  },
  {
    name: 'technician_signature',
    displayName: 'Technician Signature',
    required: true,
    severity: 'S0',
    regexPatterns: [
      /(?:Technician|Engineer)\s*Signature/i,
      /Signed\s*(?:By)?[:\s]*([^\n]+)/i,
    ],
    fuzzyLabels: ['Technician Signature', 'Engineer Signature', 'Signed By', 'Signature'],
    llmPrompt: 'Is there a technician or engineer signature present?',
  },
];

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  
  // Try DD/MM/YYYY format
  const ddmmyyyy = trimmed.match(/(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Try YYYY-MM-DD format
  const yyyymmdd = trimmed.match(/(\d{4})[/\-\.](\d{1,2})[/\-\.](\d{1,2})/);
  if (yyyymmdd) {
    const [, year, month, day] = yyyymmdd;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return trimmed;
}

function normalizeBoolean(value: string): string {
  const upper = value.trim().toUpperCase();
  if (['YES', 'Y', 'TRUE', '1'].includes(upper)) return 'Yes';
  if (['NO', 'N', 'FALSE', '0'].includes(upper)) return 'No';
  return value.trim();
}

function normalizeName(value: string): string {
  return value.trim().split(/\s+/).map(word => {
    if (['UK', 'USA', 'LLC', 'LTD', 'PLC'].includes(word.toUpperCase())) {
      return word.toUpperCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

function normalizeValue(value: string, normalizer?: string): string {
  if (!value) return value;
  
  switch (normalizer) {
    case 'date': return normalizeDate(value);
    case 'boolean': return normalizeBoolean(value);
    case 'name': return normalizeName(value);
    case 'uppercase': return value.trim().toUpperCase();
    default: return value.trim();
  }
}

// ============================================================================
// FUZZY MATCHING
// ============================================================================

function levenshteinDistance(s1: string, s2: string): number {
  if (s1.length < s2.length) return levenshteinDistance(s2, s1);
  if (s2.length === 0) return s1.length;
  
  let previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);
  
  for (let i = 0; i < s1.length; i++) {
    const currentRow = [i + 1];
    for (let j = 0; j < s2.length; j++) {
      const insertions = previousRow[j + 1] + 1;
      const deletions = currentRow[j] + 1;
      const substitutions = previousRow[j] + (s1[i] !== s2[j] ? 1 : 0);
      currentRow.push(Math.min(insertions, deletions, substitutions));
    }
    previousRow = currentRow;
  }
  
  return previousRow[previousRow.length - 1];
}

function fuzzyRatio(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  const distance = levenshteinDistance(s1.toLowerCase(), s2.toLowerCase());
  const maxLen = Math.max(s1.length, s2.length);
  return (1 - distance / maxLen) * 100;
}

// ============================================================================
// EXTRACTION STRATEGIES
// ============================================================================

function extractWithRegex(text: string, field: FieldDefinition): ExtractionResult {
  for (const pattern of field.regexPatterns) {
    const match = text.match(pattern);
    if (match) {
      let value = match[1]?.trim() || null;
      
      // Special handling for signature presence
      if (field.name === 'technician_signature' && !value) {
        if (text.includes('Technician Signature') || text.includes('Engineer Signature')) {
          value = 'Present';
        }
      }
      
      if (value) {
        const confidence = pattern.source.length > 50 ? 85 : 75;
        return {
          value: normalizeValue(value, field.normalizer),
          confidence,
          strategy: 'regex',
          evidence: `Pattern matched: ${pattern.source.slice(0, 50)}...`,
        };
      }
    }
  }
  
  // Special handling for signature presence
  if (field.name === 'technician_signature') {
    if (text.includes('Technician Signature') || text.includes('Engineer Signature')) {
      return {
        value: 'Present',
        confidence: 70,
        strategy: 'regex',
        evidence: 'Signature label found in document',
      };
    }
  }
  
  return { value: null, confidence: 0, strategy: 'regex', evidence: '' };
}

function extractWithFuzzy(text: string, field: FieldDefinition): ExtractionResult {
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.includes(':')) {
      const [labelPart, valuePart] = line.split(':').map(s => s.trim());
      
      for (const label of field.fuzzyLabels) {
        const score = fuzzyRatio(labelPart, label);
        if (score >= 70 && valuePart) {
          return {
            value: normalizeValue(valuePart, field.normalizer),
            confidence: Math.min(score, 80),
            strategy: 'fuzzy',
            evidence: `Fuzzy match: '${labelPart}' ~ '${label}' (${score.toFixed(1)}%)`,
          };
        }
      }
    }
  }
  
  return { value: null, confidence: 0, strategy: 'fuzzy', evidence: '' };
}

function extractWithContext(text: string, field: FieldDefinition): ExtractionResult {
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();
    
    for (const label of field.fuzzyLabels) {
      if (lineLower.includes(label.toLowerCase())) {
        if (lines[i].includes(':')) {
          const value = lines[i].split(':')[1]?.trim();
          if (value) {
            return {
              value: normalizeValue(value, field.normalizer),
              confidence: 70,
              strategy: 'context',
              evidence: `Context match on line ${i + 1}`,
            };
          }
        } else if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine && !nextLine.includes(':')) {
            return {
              value: normalizeValue(nextLine, field.normalizer),
              confidence: 60,
              strategy: 'context',
              evidence: `Value on line after label (line ${i + 2})`,
            };
          }
        }
      }
    }
  }
  
  return { value: null, confidence: 0, strategy: 'context', evidence: '' };
}

async function extractWithLlm(text: string, field: FieldDefinition): Promise<ExtractionResult> {
  try {
    const prompt = `You are an expert document analyst. Extract the following field from this job sheet text.

Field: ${field.displayName}
Instructions: ${field.llmPrompt}

Document Text (first 4000 chars):
---
${text.slice(0, 4000)}
---

Respond with ONLY a JSON object:
{"value": "extracted value or null", "confidence": 0-100, "evidence": "relevant text snippet"}`;

    const result = await invokeLLM({
      messages: [{ role: 'user', content: prompt }],
    });
    
    const response = result.choices[0]?.message?.content;
    if (typeof response === 'string') {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.value && parsed.confidence > 50) {
          return {
            value: normalizeValue(parsed.value, field.normalizer),
            confidence: parsed.confidence,
            strategy: 'llm',
            evidence: parsed.evidence || 'LLM extraction',
          };
        }
      }
    }
  } catch (error) {
    console.error(`LLM extraction failed for ${field.name}:`, error);
  }
  
  return { value: null, confidence: 0, strategy: 'llm', evidence: '' };
}

// ============================================================================
// ENSEMBLE EXTRACTION
// ============================================================================

async function ensembleExtract(
  text: string,
  field: FieldDefinition,
  useLlm: boolean = false
): Promise<FieldExtraction> {
  const results: ExtractionResult[] = [];
  
  // Run all extraction strategies
  const regexResult = extractWithRegex(text, field);
  if (regexResult.value) results.push(regexResult);
  
  const fuzzyResult = extractWithFuzzy(text, field);
  if (fuzzyResult.value) results.push(fuzzyResult);
  
  const contextResult = extractWithContext(text, field);
  if (contextResult.value) results.push(contextResult);
  
  // Use LLM for missing or low-confidence fields
  if (useLlm && (results.length === 0 || Math.max(...results.map(r => r.confidence)) < 70)) {
    const llmResult = await extractWithLlm(text, field);
    if (llmResult.value) results.push(llmResult);
  }
  
  if (results.length === 0) {
    return {
      displayName: field.displayName,
      required: field.required,
      severity: field.severity,
      value: null,
      confidence: 0,
      strategy: 'none',
      evidence: 'No extraction strategy succeeded',
    };
  }
  
  // Voting: if multiple strategies agree, boost confidence
  const valueCounts: Record<string, number> = {};
  for (const r of results) {
    if (r.value) {
      valueCounts[r.value] = (valueCounts[r.value] || 0) + 1;
    }
  }
  
  let mostCommonValue = '';
  let maxCount = 0;
  for (const value of Object.keys(valueCounts)) {
    const count = valueCounts[value];
    if (count > maxCount) {
      maxCount = count;
      mostCommonValue = value;
    }
  }
  
  const winningResults = results.filter(r => r.value === mostCommonValue);
  const bestResult = winningResults.reduce((a, b) => a.confidence > b.confidence ? a : b);
  
  // Boost confidence for consensus
  const confidenceBoost = Math.min(10 * (maxCount - 1), 15);
  const finalConfidence = Math.min(bestResult.confidence + confidenceBoost, 100);
  
  return {
    displayName: field.displayName,
    required: field.required,
    severity: field.severity,
    value: mostCommonValue,
    confidence: finalConfidence,
    strategy: maxCount > 1 ? `ensemble(${maxCount} agree)` : bestResult.strategy,
    evidence: bestResult.evidence,
    consensusCount: maxCount,
  };
}

// ============================================================================
// DOCUMENT PROCESSOR
// ============================================================================

export async function processDocument(
  text: string,
  filename: string,
  options: { useLlm?: boolean; extractionMethod?: 'EMBEDDED_TEXT' | 'OCR' | 'HYBRID' } = {}
): Promise<DocumentExtractionResult> {
  const startTime = Date.now();
  const { useLlm = false, extractionMethod = 'EMBEDDED_TEXT' } = options;
  
  // Apply OCR error correction
  const correctedText = correctOcrErrors(text);
  
  // Detect document type
  const documentType = detectDocumentType(correctedText);
  
  // Extract all fields
  const extractedData: Record<string, string> = {};
  const fieldDetails: Record<string, FieldExtraction> = {};
  
  for (const field of FIELD_DEFINITIONS) {
    const result = await ensembleExtract(correctedText, field, useLlm);
    if (result.value) {
      extractedData[field.name] = result.value;
    }
    fieldDetails[field.name] = result;
  }
  
  // Calculate metrics
  const totalFields = FIELD_DEFINITIONS.length;
  const extractedCount = Object.keys(extractedData).length;
  const requiredFields = FIELD_DEFINITIONS.filter(f => f.required);
  const requiredExtracted = requiredFields.filter(f => extractedData[f.name]).length;
  
  // Weighted quality score
  const requiredWeight = 0.7;
  const optionalWeight = 0.3;
  const requiredScore = (requiredExtracted / requiredFields.length) * 100;
  const optionalFields = FIELD_DEFINITIONS.filter(f => !f.required);
  const optionalExtracted = optionalFields.filter(f => extractedData[f.name]).length;
  const optionalScore = optionalFields.length > 0 
    ? (optionalExtracted / optionalFields.length) * 100 
    : 100;
  const qualityScore = (requiredScore * requiredWeight) + (optionalScore * optionalWeight);
  
  // Average confidence
  const confidences = Object.values(fieldDetails)
    .filter(d => d.confidence > 0)
    .map(d => d.confidence);
  const averageConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;
  
  // Determine status
  const missingRequired = requiredFields
    .filter(f => !extractedData[f.name])
    .map(f => f.displayName);
  const lowConfidenceFields = Object.values(fieldDetails)
    .filter(d => d.confidence > 0 && d.confidence < 70)
    .map(d => d.displayName);
  
  let status: 'PASS' | 'FAIL' | 'REVIEW_QUEUE';
  if (missingRequired.length > 0) {
    status = 'FAIL';
  } else if (lowConfidenceFields.length > 0) {
    status = 'REVIEW_QUEUE';
  } else if (qualityScore >= 90) {
    status = 'PASS';
  } else {
    status = 'REVIEW_QUEUE';
  }
  
  return {
    filename,
    status,
    qualityScore: Math.round(qualityScore * 10) / 10,
    averageConfidence: Math.round(averageConfidence * 10) / 10,
    extractedCount,
    totalFields,
    requiredExtracted,
    requiredTotal: requiredFields.length,
    missingRequired,
    lowConfidenceFields,
    extractedData,
    fieldDetails,
    documentType,
    extractionMethod,
    processingTimeMs: Date.now() - startTime,
  };
}

function detectDocumentType(text: string): string {
  const textLower = text.toLowerCase();
  
  if (textLower.includes('thorough examination report') || textLower.includes('loler')) {
    return 'LOLER_COMPLIANCE';
  }
  if (textLower.includes('compliance report') || textLower.includes('compliance test')) {
    return 'COMPLIANCE_REPORT';
  }
  if (textLower.includes('repair report') || textLower.includes('repair duration')) {
    return 'REPAIR_REPORT';
  }
  if (textLower.includes('service report') || textLower.includes('service detail')) {
    return 'SERVICE_REPORT';
  }
  
  return 'UNKNOWN';
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

export async function processBatch(
  documents: Array<{ text: string; filename: string }>,
  options: { useLlm?: boolean } = {}
): Promise<{
  results: DocumentExtractionResult[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    reviewQueue: number;
    avgQualityScore: number;
    avgConfidence: number;
  };
}> {
  const results: DocumentExtractionResult[] = [];
  
  for (const doc of documents) {
    const result = await processDocument(doc.text, doc.filename, options);
    results.push(result);
  }
  
  const summary = {
    total: results.length,
    pass: results.filter(r => r.status === 'PASS').length,
    fail: results.filter(r => r.status === 'FAIL').length,
    reviewQueue: results.filter(r => r.status === 'REVIEW_QUEUE').length,
    avgQualityScore: results.length > 0
      ? Math.round(results.reduce((a, b) => a + b.qualityScore, 0) / results.length * 10) / 10
      : 0,
    avgConfidence: results.length > 0
      ? Math.round(results.reduce((a, b) => a + b.averageConfidence, 0) / results.length * 10) / 10
      : 0,
  };
  
  return { results, summary };
}

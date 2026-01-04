/**
 * Persistence Service Implementation
 * 
 * In-memory implementation for testing and development.
 * Production would use Drizzle ORM with MySQL.
 */

import { createHash } from 'crypto';
import type { ExtractionResult, ExtractionArtifact } from '../extraction/types';
import type { ValidationResult, ValidationArtifact, ValidatedField } from '../validation/types';
import type { RuleStatus } from '../specResolver/types';
import type {
  PersistenceConfig,
  StoredExtractionArtifact,
  StoredValidationArtifact,
  StoredValidatedField,
  PipelineRunRecord,
  PipelineStatus,
  DeterminismChecksumRecord,
  IPersistenceService,
} from './types';
import { DEFAULT_PERSISTENCE_CONFIG } from './types';
import { getCorrelationId, generateCorrelationId } from '../../utils/context';

/**
 * Generate SHA-256 hash of content
 */
function hashContent(content: unknown): string {
  const json = JSON.stringify(content, Object.keys(content as object).sort());
  return createHash('sha256').update(json).digest('hex');
}

/**
 * In-memory storage for testing
 */
interface InMemoryStore {
  extractionArtifacts: Map<number, StoredExtractionArtifact>;
  validationArtifacts: Map<number, StoredValidationArtifact>;
  validatedFields: Map<number, StoredValidatedField[]>;
  pipelineRuns: Map<string, PipelineRunRecord>;
  determinismChecksums: Map<string, DeterminismChecksumRecord>;
  nextIds: {
    extraction: number;
    validation: number;
    validatedField: number;
    pipelineRun: number;
    checksum: number;
  };
}

/**
 * Create empty in-memory store
 */
function createStore(): InMemoryStore {
  return {
    extractionArtifacts: new Map(),
    validationArtifacts: new Map(),
    validatedFields: new Map(),
    pipelineRuns: new Map(),
    determinismChecksums: new Map(),
    nextIds: {
      extraction: 1,
      validation: 1,
      validatedField: 1,
      pipelineRun: 1,
      checksum: 1,
    },
  };
}

let store = createStore();

/**
 * Reset store for testing
 */
export function resetPersistenceStore(): void {
  store = createStore();
}

/**
 * In-memory persistence service implementation
 */
export class InMemoryPersistenceService implements IPersistenceService {
  private config: PersistenceConfig;

  constructor(config: Partial<PersistenceConfig> = {}) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
  }

  async storeExtractionArtifact(
    jobSheetId: number,
    result: ExtractionResult,
    artifact: ExtractionArtifact
  ): Promise<StoredExtractionArtifact> {
    const id = store.nextIds.extraction++;
    const contentHash = this.config.enableHashing ? hashContent(artifact) : '';

    const stored: StoredExtractionArtifact = {
      id,
      correlationId: result.correlationId || artifact.correlationId || '',
      jobSheetId,
      schemaVersion: artifact.version,
      extractionJson: artifact,
      contentHash,
      extractionMethod: result.metadata.ocrModel ? 'OCR' : 'EMBEDDED_TEXT',
      ocrEngineVersion: result.metadata.ocrModel,
      pageCount: result.metadata.totalPages,
      processingTimeMs: result.metadata.processingTimeMs,
      createdAt: new Date(),
    };

    store.extractionArtifacts.set(id, stored);

    // Store determinism checksum if enabled
    if (this.config.enableDeterminismCheck) {
      const inputHash = hashContent({
        jobSheetId,
        pipelineVersion: this.config.pipelineVersion,
      });
      await this.storeDeterminismChecksum('extraction', id, inputHash, contentHash);
    }

    return stored;
  }

  async storeValidationArtifact(
    jobSheetId: number,
    extractionArtifactId: number,
    goldSpecId: number,
    result: ValidationResult,
    artifact: ValidationArtifact
  ): Promise<StoredValidationArtifact> {
    const id = store.nextIds.validation++;
    const contentHash = this.config.enableHashing ? hashContent(artifact) : '';

    const stored: StoredValidationArtifact = {
      id,
      correlationId: result.correlationId || artifact.correlationId || '',
      jobSheetId,
      extractionArtifactId,
      goldSpecId,
      schemaVersion: artifact.version,
      validationJson: artifact,
      contentHash,
      overallResult: result.passed ? 'pass' : 'fail',
      passedCount: result.summary.passedRules,
      failedCount: result.summary.failedRules,
      skippedCount: result.summary.skippedRules,
      confidenceScore: undefined, // Not in current ValidationResult
      processingTimeMs: result.metadata.processingTimeMs,
      createdAt: new Date(),
    };

    store.validationArtifacts.set(id, stored);

    // Store validated fields
    const fields: StoredValidatedField[] = result.validatedFields.map((vf, index) => {
      // Map RuleStatus to StoredValidatedField status
      const mapStatus = (status: RuleStatus): 'passed' | 'failed' | 'skipped' => {
        if (status === 'passed') return 'passed';
        if (status === 'failed' || status === 'error') return 'failed';
        return 'skipped';
      };
      
      return {
        id: store.nextIds.validatedField++,
        validationArtifactId: id,
        ruleId: vf.ruleId,
        field: vf.field,
        status: mapStatus(vf.status),
        extractedValue: vf.value !== null && vf.value !== undefined ? String(vf.value) : undefined,
        confidence: vf.confidence,
        pageNumber: vf.pageNumber,
        severity: vf.severity,
        message: vf.message,
        orderIndex: index,
        createdAt: new Date(),
      };
    });

    store.validatedFields.set(id, fields);

    // Store determinism checksum if enabled
    if (this.config.enableDeterminismCheck) {
      const inputHash = hashContent({
        jobSheetId,
        extractionArtifactId,
        goldSpecId,
        pipelineVersion: this.config.pipelineVersion,
      });
      await this.storeDeterminismChecksum('validation', id, inputHash, contentHash);
    }

    return stored;
  }

  async getExtractionArtifact(id: number): Promise<StoredExtractionArtifact | null> {
    return store.extractionArtifacts.get(id) || null;
  }

  async getValidationArtifact(id: number): Promise<StoredValidationArtifact | null> {
    return store.validationArtifacts.get(id) || null;
  }

  async getValidatedFields(validationArtifactId: number): Promise<StoredValidatedField[]> {
    const fields = store.validatedFields.get(validationArtifactId) || [];
    // Return in deterministic order
    return [...fields].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async createPipelineRun(jobSheetId: number): Promise<PipelineRunRecord> {
    const id = store.nextIds.pipelineRun++;
    const correlationId = getCorrelationId() || generateCorrelationId();

    const run: PipelineRunRecord = {
      id,
      correlationId,
      jobSheetId,
      pipelineVersion: this.config.pipelineVersion,
      status: 'pending',
      startedAt: new Date(),
    };

    store.pipelineRuns.set(correlationId, run);
    return run;
  }

  async updatePipelineRun(
    correlationId: string,
    updates: Partial<Pick<PipelineRunRecord, 'status' | 'extractionArtifactId' | 'validationArtifactId' | 'errorMessage' | 'errorCode' | 'completedAt' | 'totalTimeMs'>>
  ): Promise<void> {
    const run = store.pipelineRuns.get(correlationId);
    if (!run) {
      throw new Error(`Pipeline run not found: ${correlationId}`);
    }

    Object.assign(run, updates);
  }

  async getPipelineRun(correlationId: string): Promise<PipelineRunRecord | null> {
    return store.pipelineRuns.get(correlationId) || null;
  }

  async verifyDeterminism(
    entityType: string,
    entityId: number,
    inputHash: string,
    outputHash: string
  ): Promise<boolean> {
    const key = `${entityType}:${entityId}`;
    const existing = store.determinismChecksums.get(key);

    if (!existing) {
      return true; // No previous checksum to compare
    }

    // Verify that same input produces same output
    if (existing.inputHash === inputHash && existing.outputHash !== outputHash) {
      return false; // Non-deterministic behavior detected
    }

    // Update verification status
    existing.verified = true;
    existing.verifiedAt = new Date();

    return true;
  }

  private async storeDeterminismChecksum(
    entityType: string,
    entityId: number,
    inputHash: string,
    outputHash: string
  ): Promise<void> {
    const key = `${entityType}:${entityId}`;
    const id = store.nextIds.checksum++;

    const checksum: DeterminismChecksumRecord = {
      id,
      entityType,
      entityId,
      inputHash,
      outputHash,
      pipelineVersion: this.config.pipelineVersion,
      verified: false,
      createdAt: new Date(),
    };

    store.determinismChecksums.set(key, checksum);
  }
}

/**
 * Create persistence service instance
 */
export function createPersistenceService(
  config: Partial<PersistenceConfig> = {}
): IPersistenceService {
  return new InMemoryPersistenceService(config);
}

/**
 * Default singleton instance
 */
let defaultService: IPersistenceService | null = null;

export function getPersistenceService(): IPersistenceService {
  if (!defaultService) {
    defaultService = createPersistenceService();
  }
  return defaultService;
}

export function resetPersistenceService(): void {
  defaultService = null;
  resetPersistenceStore();
}

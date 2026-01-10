/**
 * Pipeline Integration Module
 * 
 * PR-6: Wires enhancement modules into the actual pipeline:
 * - criticalFieldExtractor for critical field extraction
 * - imageQaFusion for tickboxes/signature outputs
 * - deterministicCache for fileHash+templateHash caching
 * - engineerFeedback for scorecard generation
 * 
 * All integrations are feature-flagged for safe rollout.
 */

export * from './pipelineIntegrator';
export * from './types';

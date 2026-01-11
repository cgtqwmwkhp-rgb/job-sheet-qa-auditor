/**
 * Interpreter Router
 * 
 * Routes requests to Gemini (default) or Claude (escalation).
 * 
 * CRITICAL INVARIANT:
 * - Interpreter results are ADVISORY ONLY
 * - They do NOT modify canonical document outcomes
 * - All advisory results are stored with model metadata
 */

import type {
  InterpreterRequest,
  InterpreterResponse,
  RouterRules,
  InterpreterProvider,
  EscalationReason,
  AdvisoryArtifact,
} from './types';
import { DEFAULT_ROUTER_RULES } from './types';

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `int-${timestamp}-${random}`;
}

/**
 * Generate unique artifact ID
 */
function generateArtifactId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `art-${timestamp}-${random}`;
}

/**
 * Hash function for consistent cohort assignment
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Interpreter Router class
 */
export class InterpreterRouter {
  private rules: RouterRules;
  private artifacts: AdvisoryArtifact[] = [];
  
  constructor(rules: RouterRules = DEFAULT_ROUTER_RULES) {
    this.rules = rules;
  }
  
  /**
   * Route a request to the appropriate interpreter
   */
  async route(request: InterpreterRequest): Promise<InterpreterResponse> {
    const startTime = Date.now();
    
    // Determine provider based on routing rules
    const { provider, escalated, escalationReason } = this.selectProvider(request);
    
    // Call the interpreter (simulated for now)
    const result = await this.callInterpreter(provider, request);
    
    const endTime = Date.now();
    
    // Build response
    const response: InterpreterResponse = {
      requestId: request.requestId || generateRequestId(),
      provider,
      modelVersion: this.rules.providers[provider].modelId,
      advisory: {
        value: result.value,
        confidence: result.confidence,
        reasoning: result.reasoning,
        alternatives: result.alternatives,
      },
      routing: {
        selectedProvider: provider,
        escalated,
        escalationReason,
        routingMode: this.getRoutingMode(),
        latencyMs: endTime - startTime,
      },
      cost: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: this.estimateCost(provider, result.inputTokens, result.outputTokens),
      },
      timestamps: {
        requestedAt: new Date(startTime).toISOString(),
        completedAt: new Date(endTime).toISOString(),
      },
    };
    
    return response;
  }
  
  /**
   * Select the appropriate provider based on rules
   */
  private selectProvider(request: InterpreterRequest): {
    provider: InterpreterProvider;
    escalated: boolean;
    escalationReason?: EscalationReason;
  } {
    // A/B test mode
    if (this.rules.abTest.enabled) {
      const cohort = this.assignCohort(request);
      return {
        provider: cohort,
        escalated: false,
        escalationReason: 'ab_test_assignment',
      };
    }
    
    // Check for escalation triggers
    if (this.rules.escalation.enabled) {
      const escalationReason = this.checkEscalationTriggers(request);
      if (escalationReason) {
        return {
          provider: this.rules.escalation.provider,
          escalated: true,
          escalationReason,
        };
      }
    }
    
    // Default provider
    return {
      provider: this.rules.defaultProvider,
      escalated: false,
    };
  }
  
  /**
   * Check if request should be escalated
   */
  private checkEscalationTriggers(request: InterpreterRequest): EscalationReason | null {
    const triggers = this.rules.escalation.triggers;
    
    // Low confidence escalation
    if (request.context.confidence !== undefined && 
        request.context.confidence < triggers.lowConfidenceThreshold) {
      return 'low_confidence';
    }
    
    // Complex document patterns
    for (const pattern of triggers.complexDocumentPatterns) {
      if (request.query.toLowerCase().includes(pattern) ||
          request.context.templateId?.includes(pattern)) {
        return 'complex_document';
      }
    }
    
    // High priority escalation
    if (request.priority === 'urgent') {
      return 'manual_escalation';
    }
    
    return null;
  }
  
  /**
   * Assign A/B test cohort
   */
  private assignCohort(request: InterpreterRequest): InterpreterProvider {
    const split = this.rules.abTest.trafficSplit;
    let hashValue: number;
    
    switch (this.rules.abTest.cohortAssignment) {
      case 'hash_documentId':
        hashValue = hashString(request.documentId);
        break;
      case 'hash_userId':
        hashValue = hashString(request.metadata.userId || request.documentId);
        break;
      case 'random':
      default:
        hashValue = Math.floor(Math.random() * 100);
    }
    
    const normalizedValue = (hashValue % 100) / 100;
    return normalizedValue < split.gemini ? 'gemini' : 'claude';
  }
  
  /**
   * Call the interpreter provider
   * Note: This is a simulation. In production, this would call actual APIs.
   */
  private async callInterpreter(
    provider: InterpreterProvider,
    request: InterpreterRequest
  ): Promise<{
    value: unknown;
    confidence: number;
    reasoning: string;
    alternatives?: Array<{ value: unknown; confidence: number }>;
    inputTokens: number;
    outputTokens: number;
  }> {
    // Simulate API call latency
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    
    // Simulate response
    const confidence = 0.75 + Math.random() * 0.25;
    
    return {
      value: request.context.extractedValue || 'interpreted_value',
      confidence,
      reasoning: `${provider} analysis: Based on context analysis, the extracted value appears correct with ${(confidence * 100).toFixed(1)}% confidence.`,
      alternatives: confidence < 0.9 ? [
        { value: 'alternative_1', confidence: confidence - 0.1 },
        { value: 'alternative_2', confidence: confidence - 0.2 },
      ] : undefined,
      inputTokens: 100 + Math.floor(Math.random() * 200),
      outputTokens: 50 + Math.floor(Math.random() * 100),
    };
  }
  
  /**
   * Estimate cost in USD
   */
  private estimateCost(
    provider: InterpreterProvider,
    inputTokens: number,
    outputTokens: number
  ): number {
    // Approximate pricing per 1M tokens (simplified)
    const pricing: Record<InterpreterProvider, { input: number; output: number }> = {
      gemini: { input: 0.075, output: 0.30 },
      claude: { input: 3.00, output: 15.00 },
    };
    
    const rates = pricing[provider];
    return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
  }
  
  /**
   * Get current routing mode
   */
  private getRoutingMode(): InterpreterResponse['routing']['routingMode'] {
    if (this.rules.abTest.enabled) {
      return 'ab_test';
    }
    if (this.rules.defaultProvider === 'claude') {
      return 'claude_default';
    }
    return 'gemini_default';
  }
  
  /**
   * Store advisory artifact
   * CRITICAL: This stores the advisory result but does NOT modify canonical
   */
  storeAdvisory(
    request: InterpreterRequest,
    response: InterpreterResponse,
    canonicalValue: unknown
  ): AdvisoryArtifact {
    const artifact: AdvisoryArtifact = {
      artifactId: generateArtifactId(),
      documentId: request.documentId,
      fieldId: request.context.fieldId,
      request,
      response,
      comparison: {
        canonicalValue,
        advisoryValue: response.advisory.value,
        agreesWithCanonical: this.valuesEqual(canonicalValue, response.advisory.value),
        confidenceDelta: response.advisory.confidence - (request.context.confidence || 0.5),
      },
      audit: {
        createdAt: new Date().toISOString(),
        createdBy: request.metadata.userId || 'system',
        environment: 'local',
        version: '1.0.0',
      },
    };
    
    this.artifacts.push(artifact);
    return artifact;
  }
  
  /**
   * Compare values for equality
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return String(a) === String(b);
  }
  
  /**
   * Get all stored artifacts
   */
  getArtifacts(): AdvisoryArtifact[] {
    return [...this.artifacts];
  }
  
  /**
   * Get artifacts for a document
   */
  getArtifactsForDocument(documentId: string): AdvisoryArtifact[] {
    return this.artifacts.filter(a => a.documentId === documentId);
  }
  
  /**
   * Calculate agreement rate
   */
  calculateAgreementRate(): number {
    if (this.artifacts.length === 0) return 0;
    const agreed = this.artifacts.filter(a => a.comparison.agreesWithCanonical).length;
    return agreed / this.artifacts.length;
  }
  
  /**
   * Get current rules
   */
  getRules(): RouterRules {
    return { ...this.rules };
  }
  
  /**
   * Update rules
   */
  updateRules(updates: Partial<RouterRules>): void {
    this.rules = { ...this.rules, ...updates };
  }
  
  /**
   * Enable A/B testing mode
   */
  enableAbTest(trafficSplit: { gemini: number; claude: number }): void {
    this.rules.abTest.enabled = true;
    this.rules.abTest.trafficSplit = trafficSplit;
  }
  
  /**
   * Disable A/B testing mode
   */
  disableAbTest(): void {
    this.rules.abTest.enabled = false;
  }
}

/**
 * Singleton router instance
 */
let routerInstance: InterpreterRouter | null = null;

/**
 * Get or create router instance
 */
export function getInterpreterRouter(rules?: RouterRules): InterpreterRouter {
  if (!routerInstance) {
    routerInstance = new InterpreterRouter(rules);
  }
  return routerInstance;
}

/**
 * Reset router instance (for testing)
 */
export function resetInterpreterRouter(): void {
  routerInstance = null;
}

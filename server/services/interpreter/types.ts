/**
 * Interpreter Router Types
 * 
 * Types for the Gemini/Claude interpreter routing system.
 * 
 * CRITICAL: Interpreter results are ADVISORY ONLY.
 * They do NOT change canonical document outcomes.
 */

/**
 * Available interpreter providers
 */
export type InterpreterProvider = 'gemini' | 'claude';

/**
 * Interpreter routing mode
 */
export type RoutingMode = 
  | 'gemini_default'     // Gemini for all, Claude for escalation
  | 'claude_default'     // Claude for all (expensive)
  | 'ab_test'            // A/B mode for evaluation
  | 'round_robin';       // Alternate between providers

/**
 * Escalation trigger reason
 */
export type EscalationReason = 
  | 'low_confidence'
  | 'ambiguous_extraction'
  | 'complex_document'
  | 'retry_on_error'
  | 'manual_escalation'
  | 'ab_test_assignment';

/**
 * Interpreter request
 */
export interface InterpreterRequest {
  requestId: string;
  documentId: string;
  context: {
    templateId: string;
    fieldId?: string;
    extractedValue?: unknown;
    confidence?: number;
    ocrText?: string;
    imageUrl?: string;
  };
  query: string;
  priority: 'normal' | 'high' | 'urgent';
  metadata: {
    source: 'extraction' | 'validation' | 'qa' | 'manual';
    assetType?: string;
    customerId?: string;
    userId?: string;
  };
}

/**
 * Interpreter response
 */
export interface InterpreterResponse {
  requestId: string;
  provider: InterpreterProvider;
  modelVersion: string;
  
  // Advisory result (does NOT change canonical)
  advisory: {
    value: unknown;
    confidence: number;
    reasoning: string;
    alternatives?: Array<{
      value: unknown;
      confidence: number;
    }>;
  };
  
  // Routing metadata
  routing: {
    selectedProvider: InterpreterProvider;
    escalated: boolean;
    escalationReason?: EscalationReason;
    routingMode: RoutingMode;
    latencyMs: number;
  };
  
  // Cost tracking
  cost: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  
  // Timestamps
  timestamps: {
    requestedAt: string;
    completedAt: string;
  };
}

/**
 * Router rules configuration
 */
export interface RouterRules {
  // Default provider
  defaultProvider: InterpreterProvider;
  
  // Escalation rules
  escalation: {
    enabled: boolean;
    provider: InterpreterProvider;
    triggers: {
      lowConfidenceThreshold: number;
      errorRetry: boolean;
      complexDocumentPatterns: string[];
    };
  };
  
  // A/B testing configuration
  abTest: {
    enabled: boolean;
    trafficSplit: {
      gemini: number;
      claude: number;
    };
    cohortAssignment: 'random' | 'hash_documentId' | 'hash_userId';
  };
  
  // Provider-specific settings
  providers: {
    gemini: {
      modelId: string;
      maxTokens: number;
      temperature: number;
      enabled: boolean;
    };
    claude: {
      modelId: string;
      maxTokens: number;
      temperature: number;
      enabled: boolean;
    };
  };
  
  // Rate limiting
  rateLimits: {
    maxRequestsPerMinute: number;
    maxTokensPerDay: number;
  };
}

/**
 * Advisory artifact for storage
 */
export interface AdvisoryArtifact {
  artifactId: string;
  documentId: string;
  fieldId?: string;
  
  // Request/Response data
  request: InterpreterRequest;
  response: InterpreterResponse;
  
  // Canonical comparison
  comparison: {
    canonicalValue: unknown;
    advisoryValue: unknown;
    agreesWithCanonical: boolean;
    confidenceDelta: number;
  };
  
  // Audit metadata
  audit: {
    createdAt: string;
    createdBy: string;
    environment: 'local' | 'staging' | 'production';
    version: string;
  };
}

/**
 * Router metrics for monitoring
 */
export interface RouterMetrics {
  timestamp: string;
  window: 'hourly' | 'daily' | 'weekly';
  
  // Request counts
  requests: {
    total: number;
    byProvider: Record<InterpreterProvider, number>;
    byRoutingMode: Record<RoutingMode, number>;
  };
  
  // Escalation stats
  escalations: {
    total: number;
    byReason: Record<EscalationReason, number>;
    escalationRate: number;
  };
  
  // Performance
  performance: {
    averageLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    errorRate: number;
  };
  
  // Cost
  cost: {
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedTotalCostUsd: number;
    byProvider: Record<InterpreterProvider, number>;
  };
  
  // Agreement with canonical
  agreement: {
    total: number;
    agreed: number;
    disagreed: number;
    agreementRate: number;
  };
}

/**
 * Default router rules
 */
export const DEFAULT_ROUTER_RULES: RouterRules = {
  defaultProvider: 'gemini',
  escalation: {
    enabled: true,
    provider: 'claude',
    triggers: {
      lowConfidenceThreshold: 0.70,
      errorRetry: true,
      complexDocumentPatterns: ['multi_page', 'handwritten', 'damaged'],
    },
  },
  abTest: {
    enabled: false,
    trafficSplit: {
      gemini: 0.8,
      claude: 0.2,
    },
    cohortAssignment: 'hash_documentId',
  },
  providers: {
    gemini: {
      modelId: 'gemini-1.5-pro',
      maxTokens: 4096,
      temperature: 0.1,
      enabled: true,
    },
    claude: {
      modelId: 'claude-3-5-sonnet-20241022',
      maxTokens: 4096,
      temperature: 0.1,
      enabled: true,
    },
  },
  rateLimits: {
    maxRequestsPerMinute: 60,
    maxTokensPerDay: 1000000,
  },
};

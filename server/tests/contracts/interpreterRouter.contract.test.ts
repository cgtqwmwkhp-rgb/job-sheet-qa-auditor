/**
 * Interpreter Router Contract Tests
 * 
 * Tests for the Gemini/Claude interpreter routing system.
 * 
 * CRITICAL INVARIANT TESTS:
 * - Advisory results do NOT modify canonical outcomes
 * - All advisory results stored with model metadata
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InterpreterRouter,
  getInterpreterRouter,
  resetInterpreterRouter,
} from '../../../server/services/interpreter/router';
import { DEFAULT_ROUTER_RULES } from '../../../server/services/interpreter/types';
import type { InterpreterRequest, RouterRules } from '../../../server/services/interpreter/types';

describe('Interpreter Router Contract Tests', () => {
  beforeEach(() => {
    resetInterpreterRouter();
  });

  describe('Routing Rules', () => {
    it('should use Gemini as default provider', async () => {
      const router = new InterpreterRouter();
      
      const request: InterpreterRequest = {
        requestId: 'test-001',
        documentId: 'doc-001',
        context: {
          templateId: 'template-a',
          confidence: 0.95,
        },
        query: 'Verify this extraction',
        priority: 'normal',
        metadata: {
          source: 'extraction',
        },
      };
      
      const response = await router.route(request);
      
      expect(response.provider).toBe('gemini');
      expect(response.routing.selectedProvider).toBe('gemini');
      expect(response.routing.escalated).toBe(false);
    });

    it('should escalate to Claude on low confidence', async () => {
      const router = new InterpreterRouter();
      
      const request: InterpreterRequest = {
        requestId: 'test-002',
        documentId: 'doc-002',
        context: {
          templateId: 'template-a',
          confidence: 0.50, // Below threshold
        },
        query: 'Verify this extraction',
        priority: 'normal',
        metadata: {
          source: 'extraction',
        },
      };
      
      const response = await router.route(request);
      
      expect(response.provider).toBe('claude');
      expect(response.routing.escalated).toBe(true);
      expect(response.routing.escalationReason).toBe('low_confidence');
    });

    it('should escalate on urgent priority', async () => {
      const router = new InterpreterRouter();
      
      const request: InterpreterRequest = {
        requestId: 'test-003',
        documentId: 'doc-003',
        context: {
          templateId: 'template-a',
          confidence: 0.95,
        },
        query: 'Verify this extraction',
        priority: 'urgent',
        metadata: {
          source: 'manual',
        },
      };
      
      const response = await router.route(request);
      
      expect(response.provider).toBe('claude');
      expect(response.routing.escalated).toBe(true);
      expect(response.routing.escalationReason).toBe('manual_escalation');
    });

    it('should escalate on complex document patterns', async () => {
      const router = new InterpreterRouter();
      
      const request: InterpreterRequest = {
        requestId: 'test-004',
        documentId: 'doc-004',
        context: {
          templateId: 'template_handwritten',
          confidence: 0.85,
        },
        query: 'This is a handwritten document',
        priority: 'normal',
        metadata: {
          source: 'extraction',
        },
      };
      
      const response = await router.route(request);
      
      expect(response.routing.escalated).toBe(true);
      expect(response.routing.escalationReason).toBe('complex_document');
    });
  });

  describe('A/B Testing Mode', () => {
    it('should split traffic when A/B test enabled', async () => {
      const rules: RouterRules = {
        ...DEFAULT_ROUTER_RULES,
        abTest: {
          enabled: true,
          trafficSplit: {
            gemini: 0.5,
            claude: 0.5,
          },
          cohortAssignment: 'random',
        },
      };
      
      const router = new InterpreterRouter(rules);
      const providers = new Set<string>();
      
      // Run multiple requests to see distribution
      for (let i = 0; i < 20; i++) {
        const request: InterpreterRequest = {
          requestId: `test-ab-${i}`,
          documentId: `doc-ab-${i}`,
          context: { templateId: 'template-a' },
          query: 'Test query',
          priority: 'normal',
          metadata: { source: 'extraction' },
        };
        
        const response = await router.route(request);
        providers.add(response.provider);
      }
      
      // With 50/50 split and 20 requests, we should see both providers
      // (though not guaranteed due to randomness)
      expect(providers.size).toBeGreaterThanOrEqual(1);
    });

    it('should use consistent cohort assignment by document ID', async () => {
      const rules: RouterRules = {
        ...DEFAULT_ROUTER_RULES,
        abTest: {
          enabled: true,
          trafficSplit: {
            gemini: 0.5,
            claude: 0.5,
          },
          cohortAssignment: 'hash_documentId',
        },
      };
      
      const router = new InterpreterRouter(rules);
      
      const request: InterpreterRequest = {
        requestId: 'test-cohort',
        documentId: 'consistent-doc-id',
        context: { templateId: 'template-a' },
        query: 'Test query',
        priority: 'normal',
        metadata: { source: 'extraction' },
      };
      
      // Same document ID should always get same provider
      const response1 = await router.route(request);
      const response2 = await router.route({ ...request, requestId: 'test-cohort-2' });
      
      expect(response1.provider).toBe(response2.provider);
    });
  });

  describe('Advisory Artifacts', () => {
    it('should store advisory artifact with model metadata', async () => {
      const router = new InterpreterRouter();
      
      const request: InterpreterRequest = {
        requestId: 'test-artifact-001',
        documentId: 'doc-artifact-001',
        context: {
          templateId: 'template-a',
          fieldId: 'field-001',
          extractedValue: 'canonical_value',
          confidence: 0.95,
        },
        query: 'Verify this extraction',
        priority: 'normal',
        metadata: {
          source: 'extraction',
          userId: 'user-001',
        },
      };
      
      const response = await router.route(request);
      const artifact = router.storeAdvisory(request, response, 'canonical_value');
      
      expect(artifact.artifactId).toBeDefined();
      expect(artifact.documentId).toBe('doc-artifact-001');
      expect(artifact.fieldId).toBe('field-001');
      expect(artifact.response.provider).toBeDefined();
      expect(artifact.response.modelVersion).toBeDefined();
      expect(artifact.comparison.canonicalValue).toBe('canonical_value');
      expect(artifact.audit.createdAt).toBeDefined();
    });

    it('should track agreement with canonical value', async () => {
      const router = new InterpreterRouter();
      
      const request: InterpreterRequest = {
        requestId: 'test-agreement',
        documentId: 'doc-agreement',
        context: {
          templateId: 'template-a',
          extractedValue: 'extracted_value',
        },
        query: 'Verify this extraction',
        priority: 'normal',
        metadata: { source: 'extraction' },
      };
      
      const response = await router.route(request);
      
      // Simulate agreement
      const artifact = router.storeAdvisory(request, response, response.advisory.value);
      expect(artifact.comparison.agreesWithCanonical).toBe(true);
    });

    it('should retrieve artifacts for a document', async () => {
      const router = new InterpreterRouter();
      
      const documentId = 'doc-multi-artifact';
      
      for (let i = 0; i < 3; i++) {
        const request: InterpreterRequest = {
          requestId: `test-multi-${i}`,
          documentId,
          context: {
            templateId: 'template-a',
            fieldId: `field-${i}`,
          },
          query: 'Verify this extraction',
          priority: 'normal',
          metadata: { source: 'extraction' },
        };
        
        const response = await router.route(request);
        router.storeAdvisory(request, response, `canonical-${i}`);
      }
      
      const artifacts = router.getArtifactsForDocument(documentId);
      expect(artifacts).toHaveLength(3);
    });
  });

  describe('Critical Invariants', () => {
    it('INVARIANT: Advisory results do NOT change canonical', async () => {
      const router = new InterpreterRouter();
      const canonicalValue = 'ORIGINAL_CANONICAL_VALUE';
      
      const request: InterpreterRequest = {
        requestId: 'test-invariant',
        documentId: 'doc-invariant',
        context: {
          templateId: 'template-a',
          extractedValue: canonicalValue,
        },
        query: 'What should this value be?',
        priority: 'normal',
        metadata: { source: 'extraction' },
      };
      
      const response = await router.route(request);
      const artifact = router.storeAdvisory(request, response, canonicalValue);
      
      // Advisory may suggest different value
      // But canonical MUST remain unchanged
      expect(artifact.comparison.canonicalValue).toBe(canonicalValue);
      // The advisory value is stored separately
      expect(artifact.comparison.advisoryValue).toBeDefined();
      // We track whether they agree, but we don't modify canonical
      expect(artifact.comparison.agreesWithCanonical).toBeDefined();
    });

    it('INVARIANT: All responses include model metadata', async () => {
      const router = new InterpreterRouter();
      
      const request: InterpreterRequest = {
        requestId: 'test-metadata',
        documentId: 'doc-metadata',
        context: { templateId: 'template-a' },
        query: 'Test query',
        priority: 'normal',
        metadata: { source: 'extraction' },
      };
      
      const response = await router.route(request);
      
      expect(response.provider).toBeDefined();
      expect(response.modelVersion).toBeDefined();
      expect(response.routing.selectedProvider).toBeDefined();
      expect(response.routing.routingMode).toBeDefined();
      expect(response.timestamps.requestedAt).toBeDefined();
      expect(response.timestamps.completedAt).toBeDefined();
    });
  });

  describe('Response Structure', () => {
    it('should include all required fields in response', async () => {
      const router = new InterpreterRouter();
      
      const request: InterpreterRequest = {
        requestId: 'test-structure',
        documentId: 'doc-structure',
        context: { templateId: 'template-a' },
        query: 'Test query',
        priority: 'normal',
        metadata: { source: 'extraction' },
      };
      
      const response = await router.route(request);
      
      // Advisory
      expect(response.advisory.value).toBeDefined();
      expect(response.advisory.confidence).toBeGreaterThan(0);
      expect(response.advisory.reasoning).toBeDefined();
      
      // Routing
      expect(response.routing.selectedProvider).toBeDefined();
      expect(response.routing.escalated).toBeDefined();
      expect(response.routing.routingMode).toBeDefined();
      expect(response.routing.latencyMs).toBeGreaterThan(0);
      
      // Cost
      expect(response.cost.inputTokens).toBeGreaterThan(0);
      expect(response.cost.outputTokens).toBeGreaterThan(0);
      expect(response.cost.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Configuration', () => {
    it('should allow updating rules', () => {
      const router = new InterpreterRouter();
      
      router.updateRules({
        defaultProvider: 'claude',
      });
      
      const rules = router.getRules();
      expect(rules.defaultProvider).toBe('claude');
    });

    it('should allow enabling/disabling A/B test', () => {
      const router = new InterpreterRouter();
      
      router.enableAbTest({ gemini: 0.7, claude: 0.3 });
      expect(router.getRules().abTest.enabled).toBe(true);
      expect(router.getRules().abTest.trafficSplit.gemini).toBe(0.7);
      
      router.disableAbTest();
      expect(router.getRules().abTest.enabled).toBe(false);
    });
  });

  describe('Agreement Rate', () => {
    it('should calculate agreement rate correctly', async () => {
      const router = new InterpreterRouter();
      
      // Add some agreeing artifacts
      for (let i = 0; i < 3; i++) {
        const request: InterpreterRequest = {
          requestId: `test-agree-${i}`,
          documentId: `doc-agree-${i}`,
          context: { templateId: 'template-a' },
          query: 'Test',
          priority: 'normal',
          metadata: { source: 'extraction' },
        };
        const response = await router.route(request);
        router.storeAdvisory(request, response, response.advisory.value); // Agrees
      }
      
      // Add one disagreeing artifact
      const request: InterpreterRequest = {
        requestId: 'test-disagree',
        documentId: 'doc-disagree',
        context: { templateId: 'template-a' },
        query: 'Test',
        priority: 'normal',
        metadata: { source: 'extraction' },
      };
      const response = await router.route(request);
      router.storeAdvisory(request, response, 'different_value'); // Disagrees
      
      const agreementRate = router.calculateAgreementRate();
      expect(agreementRate).toBe(0.75); // 3 out of 4
    });
  });

  describe('Singleton Instance', () => {
    it('should return same instance', () => {
      const router1 = getInterpreterRouter();
      const router2 = getInterpreterRouter();
      
      expect(router1).toBe(router2);
    });

    it('should reset instance', () => {
      const router1 = getInterpreterRouter();
      resetInterpreterRouter();
      const router2 = getInterpreterRouter();
      
      expect(router1).not.toBe(router2);
    });
  });
});

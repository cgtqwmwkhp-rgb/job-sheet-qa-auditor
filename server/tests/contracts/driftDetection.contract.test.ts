/**
 * Drift Detection Contract Tests
 */

import { describe, it, expect } from 'vitest';
import {
  detectAmbiguitySpike,
  detectTokenCollisions,
  detectOverrideSpike,
  detectScanQualityDegradation,
  detectSelectionAccuracyDrift,
  detectFieldAccuracyDrift,
  detectFusionDisagreement,
  detectPass2Escalation,
} from '../../../scripts/drift/detectors';
import { DEFAULT_DRIFT_THRESHOLDS } from '../../../scripts/drift/types';
import type { DriftBaseline, AmbiguityRateData, TokenCollisionData, OverrideSpikeData, ScanQualityData } from '../../../scripts/drift/types';

describe('Drift Detection Contract Tests', () => {
  const baseline: DriftBaseline = {
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00Z',
    ambiguityRate: 0.05,
    tokenCollisionRate: 0.02,
    overrideRate: 0.08,
    averageScanQuality: 0.95,
    selectionAccuracy: 0.95,
    fieldAccuracy: 0.92,
    fusionAgreementRate: 0.90,
    pass2Rate: 0.08,
    byTemplateId: {},
  };

  describe('Ambiguity Rate Detection', () => {
    it('should not alert when ambiguity rate is below warning threshold', () => {
      const data: AmbiguityRateData = {
        totalDocuments: 100,
        ambiguousSelections: 5, // 5%
        byTemplateId: {},
      };

      const alerts = detectAmbiguitySpike(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(0);
    });

    it('should alert with warning when ambiguity rate exceeds warning threshold', () => {
      const data: AmbiguityRateData = {
        totalDocuments: 100,
        ambiguousSelections: 12, // 12% > 10% warning
        byTemplateId: {},
      };

      const alerts = detectAmbiguitySpike(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].category).toBe('ambiguity_rate');
    });

    it('should alert with critical when ambiguity rate exceeds critical threshold', () => {
      const data: AmbiguityRateData = {
        totalDocuments: 100,
        ambiguousSelections: 25, // 25% > 20% critical
        byTemplateId: {},
      };

      const alerts = detectAmbiguitySpike(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('critical');
    });

    it('should include affected templates in alert', () => {
      const data: AmbiguityRateData = {
        totalDocuments: 100,
        ambiguousSelections: 15,
        byTemplateId: {
          'template-a': { total: 50, ambiguous: 8, rate: 0.16 },
          'template-b': { total: 50, ambiguous: 7, rate: 0.14 },
        },
      };

      const alerts = detectAmbiguitySpike(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].affectedTemplates).toContain('template-a');
      expect(alerts[0].affectedTemplates).toContain('template-b');
    });
  });

  describe('Token Collision Detection', () => {
    it('should not alert when collision rate is below threshold', () => {
      const data: TokenCollisionData = {
        totalTokens: 500,
        collisions: 10, // 2%
        byTemplateId: {},
      };

      const alerts = detectTokenCollisions(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(0);
    });

    it('should alert when collision rate exceeds threshold', () => {
      const data: TokenCollisionData = {
        totalTokens: 500,
        collisions: 40, // 8% > 5% warning
        byTemplateId: {},
      };

      const alerts = detectTokenCollisions(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].category).toBe('token_collision');
    });
  });

  describe('Override Spike Detection', () => {
    it('should not alert when override rate is normal', () => {
      const data: OverrideSpikeData = {
        totalDecisions: 100,
        overrides: 10, // 10%
        byType: {},
      };

      const alerts = detectOverrideSpike(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(0);
    });

    it('should alert when override rate spikes', () => {
      const data: OverrideSpikeData = {
        totalDecisions: 100,
        overrides: 35, // 35% > 30% critical
        byType: {},
      };

      const alerts = detectOverrideSpike(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('critical');
      expect(alerts[0].category).toBe('override_spike');
    });
  });

  describe('Scan Quality Detection', () => {
    it('should not alert when quality is good', () => {
      const data: ScanQualityData = {
        totalScans: 100,
        lowQualityScans: 5,
        averageConfidence: 0.93, // Only 2% drop from 0.95 baseline
        byField: {},
      };

      const alerts = detectScanQualityDegradation(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(0);
    });

    it('should alert when quality drops significantly', () => {
      const data: ScanQualityData = {
        totalScans: 100,
        lowQualityScans: 10,
        averageConfidence: 0.82, // 13% drop from 0.95 baseline
        byField: {},
      };

      const alerts = detectScanQualityDegradation(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].category).toBe('scan_quality');
    });

    it('should alert on high low-quality scan rate', () => {
      const data: ScanQualityData = {
        totalScans: 100,
        lowQualityScans: 40, // 40% low quality
        averageConfidence: 0.92,
        byField: {},
      };

      const alerts = detectScanQualityDegradation(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts.some(a => a.metric === 'low_quality_scan_rate')).toBe(true);
    });
  });

  describe('Selection Accuracy Drift', () => {
    it('should not alert when accuracy is stable', () => {
      const alerts = detectSelectionAccuracyDrift(0.94, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(0);
    });

    it('should alert when accuracy drops below warning threshold', () => {
      const alerts = detectSelectionAccuracyDrift(0.91, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('warning');
    });

    it('should alert critical when accuracy drops significantly', () => {
      const alerts = detectSelectionAccuracyDrift(0.88, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('critical');
    });
  });

  describe('Field Accuracy Drift', () => {
    it('should not alert when accuracy is stable', () => {
      const alerts = detectFieldAccuracyDrift(0.90, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(0);
    });

    it('should alert when accuracy drops', () => {
      const alerts = detectFieldAccuracyDrift(0.80, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].category).toBe('field_accuracy');
    });
  });

  describe('Fusion Disagreement Detection', () => {
    it('should not alert when disagreement is low', () => {
      const alerts = detectFusionDisagreement(0.10, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(0);
    });

    it('should alert when disagreement rate is high', () => {
      const alerts = detectFusionDisagreement(0.30, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].category).toBe('fusion_disagreement');
      expect(alerts[0].severity).toBe('critical');
    });
  });

  describe('Pass-2 Escalation Detection', () => {
    it('should not alert when escalation rate is normal', () => {
      const alerts = detectPass2Escalation(0.12, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(0);
    });

    it('should alert when escalation rate is high', () => {
      const alerts = detectPass2Escalation(0.40, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].category).toBe('pass2_escalation');
      expect(alerts[0].severity).toBe('critical');
    });
  });

  describe('Alert Structure', () => {
    it('should include all required fields in alerts', () => {
      const data: AmbiguityRateData = {
        totalDocuments: 100,
        ambiguousSelections: 25,
        byTemplateId: {},
      };

      const alerts = detectAmbiguitySpike(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      const alert = alerts[0];

      expect(alert.id).toBeDefined();
      expect(alert.category).toBeDefined();
      expect(alert.severity).toBeDefined();
      expect(alert.status).toBe('active');
      expect(alert.message).toBeDefined();
      expect(alert.detectedAt).toBeDefined();
      expect(alert.metric).toBeDefined();
      expect(alert.currentValue).toBeDefined();
      expect(alert.threshold).toBeDefined();
      expect(alert.baselineValue).toBeDefined();
      expect(alert.deviation).toBeDefined();
    });

    it('should include suggested action when available', () => {
      const data: AmbiguityRateData = {
        totalDocuments: 100,
        ambiguousSelections: 25,
        byTemplateId: {},
      };

      const alerts = detectAmbiguitySpike(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts[0].suggestedAction).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero total documents', () => {
      const data: AmbiguityRateData = {
        totalDocuments: 0,
        ambiguousSelections: 0,
        byTemplateId: {},
      };

      const alerts = detectAmbiguitySpike(data, baseline, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(0);
    });

    it('should handle null baseline', () => {
      const data: AmbiguityRateData = {
        totalDocuments: 100,
        ambiguousSelections: 25,
        byTemplateId: {},
      };

      const alerts = detectAmbiguitySpike(data, null, DEFAULT_DRIFT_THRESHOLDS);
      expect(alerts).toHaveLength(1);
    });
  });
});

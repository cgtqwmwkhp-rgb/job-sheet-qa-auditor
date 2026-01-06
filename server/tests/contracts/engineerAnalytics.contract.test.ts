/**
 * Engineer Analytics Contract Tests
 * 
 * Tests for engineer performance tracking, scoring, and Fix Pack generation.
 * Ensures deterministic outputs and stable ordering.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateScoreCard,
  generateFixPack,
  calculateTrendAnalytics,
  exportFixPackToJson,
  exportScoreCardToJson,
  getDefaultTrainingModules,
  type EngineerProfile,
  type IssueOccurrence,
} from '../../services/engineerAnalytics';

describe('Engineer Analytics Contract Tests', () => {
  const sampleEngineer: EngineerProfile = {
    id: 'eng-001',
    name: 'John Smith',
    employeeId: 'EMP-12345',
    region: 'Northeast',
    team: 'Team A',
    startDate: '2023-01-15',
    isActive: true,
  };
  
  const sampleIssues: IssueOccurrence[] = [
    {
      id: 'issue-001',
      engineerId: 'eng-001',
      documentId: 'doc-001',
      issueType: 'MISSING_FIELD',
      severity: 'S1',
      fieldName: 'customerSignature',
      reasonCode: 'MISSING_FIELD',
      occurredAt: '2024-01-10T10:00:00Z',
      wasDisputed: false,
      wasWaived: false,
      resolutionStatus: 'open',
    },
    {
      id: 'issue-002',
      engineerId: 'eng-001',
      documentId: 'doc-002',
      issueType: 'SIGNATURE_MISSING',
      severity: 'S0',
      fieldName: 'customerSignature',
      reasonCode: 'SIGNATURE_MISSING',
      occurredAt: '2024-01-12T14:00:00Z',
      wasDisputed: false,
      wasWaived: false,
      resolutionStatus: 'open',
    },
    {
      id: 'issue-003',
      engineerId: 'eng-001',
      documentId: 'doc-003',
      issueType: 'INVALID_FORMAT',
      severity: 'S2',
      fieldName: 'serviceDate',
      reasonCode: 'INVALID_FORMAT',
      occurredAt: '2024-01-15T09:00:00Z',
      wasDisputed: false,
      wasWaived: false,
      resolutionStatus: 'resolved',
    },
    {
      id: 'issue-004',
      engineerId: 'eng-001',
      documentId: 'doc-004',
      issueType: 'SIGNATURE_MISSING',
      severity: 'S0',
      fieldName: 'customerSignature',
      reasonCode: 'SIGNATURE_MISSING',
      occurredAt: '2024-01-18T11:00:00Z',
      wasDisputed: false,
      wasWaived: false,
      resolutionStatus: 'open',
    },
  ];
  
  describe('Training Modules', () => {
    it('should provide default training modules', () => {
      const modules = getDefaultTrainingModules();
      
      expect(modules.length).toBeGreaterThan(0);
      expect(modules[0].id).toBeDefined();
      expect(modules[0].title).toBeDefined();
      expect(modules[0].relatedIssueTypes.length).toBeGreaterThan(0);
    });
    
    it('should have valid module structure', () => {
      const modules = getDefaultTrainingModules();
      
      for (const module of modules) {
        expect(module.id).toBeDefined();
        expect(module.title).toBeDefined();
        expect(module.description).toBeDefined();
        expect(typeof module.estimatedMinutes).toBe('number');
        expect(Array.isArray(module.relatedIssueTypes)).toBe(true);
      }
    });
  });
  
  describe('Score Card Calculation', () => {
    it('should calculate score card for engineer', () => {
      const scoreCard = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      
      expect(scoreCard.engineerId).toBe(sampleEngineer.id);
      expect(scoreCard.engineerName).toBe(sampleEngineer.name);
      expect(scoreCard.overallScore).toBeGreaterThanOrEqual(0);
      expect(scoreCard.overallScore).toBeLessThanOrEqual(100);
    });
    
    it('should calculate issue rate correctly', () => {
      const scoreCard = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      
      expect(scoreCard.documentsProcessed).toBe(10);
      expect(scoreCard.documentsWithIssues).toBe(4);
      expect(scoreCard.issueRate).toBe(0.4);
    });
    
    it('should count issues by severity', () => {
      const scoreCard = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      
      expect(scoreCard.issuesBySeverity.S0).toBe(2);
      expect(scoreCard.issuesBySeverity.S1).toBe(1);
      expect(scoreCard.issuesBySeverity.S2).toBe(1);
      expect(scoreCard.issuesBySeverity.S3).toBe(0);
    });
    
    it('should count issues by type', () => {
      const scoreCard = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      
      expect(scoreCard.issuesByType.length).toBeGreaterThan(0);
      
      const signatureIssues = scoreCard.issuesByType.find(
        t => t.issueType === 'SIGNATURE_MISSING'
      );
      expect(signatureIssues?.count).toBe(2);
    });
    
    it('should identify recurring issues', () => {
      const scoreCard = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      
      expect(scoreCard.topRecurringIssues.length).toBeGreaterThan(0);
      
      const signatureRecurring = scoreCard.topRecurringIssues.find(
        r => r.issueType === 'SIGNATURE_MISSING'
      );
      expect(signatureRecurring?.occurrenceCount).toBe(2);
    });
    
    it('should generate recommendations', () => {
      const scoreCard = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      
      expect(scoreCard.recommendations.length).toBeGreaterThan(0);
      
      // Should have high priority recommendation for S0 issues
      const highPriority = scoreCard.recommendations.find(
        r => r.priority === 'high'
      );
      expect(highPriority).toBeDefined();
    });
    
    it('should determine trend', () => {
      const scoreCard = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      
      expect(['improving', 'stable', 'declining']).toContain(scoreCard.trend);
    });
  });
  
  describe('Fix Pack Generation', () => {
    it('should generate Fix Pack for engineer', () => {
      const fixPack = generateFixPack(sampleEngineer, sampleIssues);
      
      expect(fixPack.id).toBeDefined();
      expect(fixPack.engineerId).toBe(sampleEngineer.id);
      expect(fixPack.engineerName).toBe(sampleEngineer.name);
      expect(fixPack.generatedAt).toBeDefined();
      expect(fixPack.validUntil).toBeDefined();
    });
    
    it('should include summary', () => {
      const fixPack = generateFixPack(sampleEngineer, sampleIssues);
      
      expect(fixPack.summary.totalIssues).toBe(sampleIssues.length);
      expect(fixPack.summary.criticalIssues).toBe(2); // 2 S0 issues
      expect(fixPack.summary.focusAreas.length).toBeGreaterThan(0);
    });
    
    it('should include issues with examples', () => {
      const fixPack = generateFixPack(sampleEngineer, sampleIssues);
      
      expect(fixPack.issues.length).toBeGreaterThan(0);
      
      for (const issue of fixPack.issues) {
        expect(issue.issueType).toBeDefined();
        expect(issue.fieldName).toBeDefined();
        expect(issue.occurrenceCount).toBeGreaterThan(0);
        expect(issue.correctProcedure).toBeDefined();
        expect(issue.examples.length).toBeGreaterThan(0);
      }
    });
    
    it('should include relevant training modules', () => {
      const fixPack = generateFixPack(sampleEngineer, sampleIssues);
      
      expect(fixPack.trainingModules.length).toBeGreaterThan(0);
    });
    
    it('should require acknowledgment for critical issues', () => {
      const fixPack = generateFixPack(sampleEngineer, sampleIssues);
      
      // Has S0 issues, so acknowledgment should be required
      expect(fixPack.acknowledgment.required).toBe(true);
    });
    
    it('should sort issues by severity', () => {
      const fixPack = generateFixPack(sampleEngineer, sampleIssues);
      
      const severityOrder = { S0: 0, S1: 1, S2: 2, S3: 3 };
      for (let i = 1; i < fixPack.issues.length; i++) {
        const prevSeverity = severityOrder[fixPack.issues[i - 1].severity];
        const currSeverity = severityOrder[fixPack.issues[i].severity];
        expect(currSeverity).toBeGreaterThanOrEqual(prevSeverity);
      }
    });
  });
  
  describe('Trend Analytics', () => {
    const sampleDocuments = [
      { id: 'doc-001', processedAt: '2024-01-10T10:00:00Z' },
      { id: 'doc-002', processedAt: '2024-01-12T14:00:00Z' },
      { id: 'doc-003', processedAt: '2024-01-15T09:00:00Z' },
      { id: 'doc-004', processedAt: '2024-01-18T11:00:00Z' },
      { id: 'doc-005', processedAt: '2024-01-20T16:00:00Z' },
    ];
    
    it('should calculate trend analytics', () => {
      const trends = calculateTrendAnalytics(
        sampleIssues,
        sampleDocuments,
        '2024-01-01',
        '2024-01-31',
        'week'
      );
      
      expect(trends.period.start).toBe('2024-01-01');
      expect(trends.period.end).toBe('2024-01-31');
      expect(trends.period.granularity).toBe('week');
    });
    
    it('should generate time series', () => {
      const trends = calculateTrendAnalytics(
        sampleIssues,
        sampleDocuments,
        '2024-01-01',
        '2024-01-31',
        'week'
      );
      
      expect(trends.timeSeries.length).toBeGreaterThan(0);
      
      for (const point of trends.timeSeries) {
        expect(point.date).toBeDefined();
        expect(typeof point.documentsProcessed).toBe('number');
        expect(typeof point.issueCount).toBe('number');
        expect(typeof point.issueRate).toBe('number');
        expect(typeof point.avgScore).toBe('number');
      }
    });
    
    it('should calculate overall trend', () => {
      const trends = calculateTrendAnalytics(
        sampleIssues,
        sampleDocuments,
        '2024-01-01',
        '2024-01-31',
        'week'
      );
      
      expect(['improving', 'stable', 'declining']).toContain(
        trends.overallTrend.direction
      );
      expect(typeof trends.overallTrend.changePercent).toBe('number');
    });
    
    it('should calculate issue type trends', () => {
      const trends = calculateTrendAnalytics(
        sampleIssues,
        sampleDocuments,
        '2024-01-01',
        '2024-01-31',
        'week'
      );
      
      expect(trends.issueTypeTrends.length).toBeGreaterThan(0);
      
      for (const typeTrend of trends.issueTypeTrends) {
        expect(typeTrend.issueType).toBeDefined();
        expect(typeof typeTrend.currentCount).toBe('number');
        expect(typeof typeTrend.previousCount).toBe('number');
        expect(['increasing', 'stable', 'decreasing']).toContain(typeTrend.trend);
      }
    });
  });
  
  describe('Export Functions', () => {
    it('should export Fix Pack to valid JSON', () => {
      const fixPack = generateFixPack(sampleEngineer, sampleIssues);
      const json = exportFixPackToJson(fixPack);
      
      expect(() => JSON.parse(json)).not.toThrow();
      
      const parsed = JSON.parse(json);
      expect(parsed.schemaVersion).toBe('1.0.0');
      expect(parsed.type).toBe('fix-pack');
    });
    
    it('should export score card to valid JSON', () => {
      const scoreCard = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      const json = exportScoreCardToJson(scoreCard);
      
      expect(() => JSON.parse(json)).not.toThrow();
      
      const parsed = JSON.parse(json);
      expect(parsed.schemaVersion).toBe('1.0.0');
      expect(parsed.type).toBe('score-card');
    });
  });
  
  describe('Stable Ordering', () => {
    it('should maintain stable issue type ordering', () => {
      const scoreCard1 = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      const scoreCard2 = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      
      expect(scoreCard1.issuesByType.map(t => t.issueType))
        .toEqual(scoreCard2.issuesByType.map(t => t.issueType));
    });
    
    it('should maintain stable recurring issue ordering', () => {
      const scoreCard1 = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      const scoreCard2 = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      
      expect(scoreCard1.topRecurringIssues.map(r => r.issueType))
        .toEqual(scoreCard2.topRecurringIssues.map(r => r.issueType));
    });
    
    it('should maintain stable Fix Pack issue ordering', () => {
      const fixPack1 = generateFixPack(sampleEngineer, sampleIssues);
      const fixPack2 = generateFixPack(sampleEngineer, sampleIssues);
      
      expect(fixPack1.issues.map(i => `${i.issueType}:${i.fieldName}`))
        .toEqual(fixPack2.issues.map(i => `${i.issueType}:${i.fieldName}`));
    });
  });
  
  describe('Deterministic Output', () => {
    it('should produce identical score cards for identical input', () => {
      const scoreCard1 = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      const scoreCard2 = calculateScoreCard(
        sampleEngineer,
        sampleIssues,
        10,
        '2024-01-01',
        '2024-01-31'
      );
      
      // Compare key metrics
      expect(scoreCard1.overallScore).toBe(scoreCard2.overallScore);
      expect(scoreCard1.issueRate).toBe(scoreCard2.issueRate);
      expect(scoreCard1.issuesBySeverity).toEqual(scoreCard2.issuesBySeverity);
    });
    
    it('should produce identical trend analytics for identical input', () => {
      const docs = [
        { id: 'doc-001', processedAt: '2024-01-10T10:00:00Z' },
        { id: 'doc-002', processedAt: '2024-01-15T10:00:00Z' },
      ];
      
      const trends1 = calculateTrendAnalytics(
        sampleIssues,
        docs,
        '2024-01-01',
        '2024-01-31',
        'week'
      );
      const trends2 = calculateTrendAnalytics(
        sampleIssues,
        docs,
        '2024-01-01',
        '2024-01-31',
        'week'
      );
      
      expect(trends1.overallTrend).toEqual(trends2.overallTrend);
      expect(trends1.timeSeries).toEqual(trends2.timeSeries);
    });
  });
});

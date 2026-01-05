/**
 * Stage 14d: Alert Rules Validation Contract Tests
 * 
 * Verifies that alert-rules.yml does not contain placeholder domains
 * and follows required conventions.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Stage 14d: Alert Rules Validation', () => {
  const alertRulesPath = path.join(process.cwd(), 'scripts/monitoring/alert-rules.yml');
  
  let alertRulesContent: string;
  
  try {
    alertRulesContent = fs.readFileSync(alertRulesPath, 'utf-8');
  } catch {
    alertRulesContent = '';
  }
  
  describe('Placeholder Domain Prevention', () => {
    const forbiddenDomains = [
      'example.com',
      'example.org',
      'example.net',
      'placeholder.com',
      'your-domain.com',
      'your-company.com'
    ];
    
    it('alert-rules.yml must exist', () => {
      expect(alertRulesContent.length).toBeGreaterThan(0);
    });
    
    forbiddenDomains.forEach(domain => {
      it(`MUST NOT contain placeholder domain: ${domain}`, () => {
        expect(alertRulesContent).not.toContain(domain);
      });
    });
  });
  
  describe('Runbook URLs', () => {
    it('should use repo-local paths for runbook URLs', () => {
      const runbookUrls = alertRulesContent.match(/runbook_url:\s*"([^"]+)"/g) || [];
      
      runbookUrls.forEach(url => {
        const urlValue = url.match(/"([^"]+)"/)?.[1] || '';
        // Should either be a repo-local path or a valid external URL (not placeholder)
        if (urlValue.startsWith('http://') || urlValue.startsWith('https://')) {
          expect(urlValue).not.toContain('example.com');
          expect(urlValue).not.toContain('placeholder');
        } else {
          expect(urlValue).toMatch(/^docs\//);
        }
      });
    });
  });
  
  describe('Canonical Severity Labels', () => {
    const canonicalSeverities = ['S0', 'S1', 'S2', 'S3'];
    
    canonicalSeverities.forEach(severity => {
      it(`should have alerts for canonical severity: ${severity}`, () => {
        expect(alertRulesContent).toContain(`severity="${severity}"`);
      });
    });
  });
  
  describe('Required Alert Groups', () => {
    const requiredGroups = ['parity_alerts', 'integrity_alerts', 'operational_alerts'];
    
    requiredGroups.forEach(group => {
      it(`should have required alert group: ${group}`, () => {
        expect(alertRulesContent).toContain(`name: ${group}`);
      });
    });
  });
  
  describe('Alert Structure', () => {
    it('should have ParityFailureOnMain alert', () => {
      expect(alertRulesContent).toContain('alert: ParityFailureOnMain');
    });
    
    it('should have IntegrityMismatchSpike alert', () => {
      expect(alertRulesContent).toContain('alert: IntegrityMismatchSpike');
    });
    
    it('should have MetricsEndpointDown alert', () => {
      expect(alertRulesContent).toContain('alert: MetricsEndpointDown');
    });
  });
});

describe('Stage 14d: Validate Alert Rules Script', () => {
  const scriptPath = path.join(process.cwd(), 'scripts/monitoring/validate-alert-rules.ts');
  
  it('validate-alert-rules.ts must exist', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
  });
  
  it('should check for forbidden domains', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('FORBIDDEN_DOMAINS');
    expect(content).toContain('example.com');
  });
  
  it('should check for canonical severities', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('CANONICAL_SEVERITIES');
    expect(content).toContain('S0');
    expect(content).toContain('S1');
    expect(content).toContain('S2');
    expect(content).toContain('S3');
  });
});

/**
 * FindingsPanel Component - Stage 6
 * 
 * Displays audit findings with severity-based styling.
 * Maintains deterministic ordering from API (severity then field).
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Finding data structure (matches API response)
 */
export interface Finding {
  id: number;
  ruleId: string;
  field: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
  extractedValue?: string;
  expectedPattern?: string;
  pageNumber?: number;
}

/**
 * Props for FindingsPanel
 */
export interface FindingsPanelProps {
  findings: Finding[];
  className?: string;
}

/**
 * Get icon for severity
 */
function getSeverityIcon(severity: Finding['severity']) {
  switch (severity) {
    case 'critical':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'major':
      return <AlertCircle className="h-5 w-5 text-orange-500" />;
    case 'minor':
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case 'info':
      return <Info className="h-5 w-5 text-blue-500" />;
  }
}

/**
 * Get badge variant for severity
 */
function getSeverityBadgeVariant(severity: Finding['severity']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (severity) {
    case 'critical':
      return 'destructive';
    case 'major':
      return 'default';
    case 'minor':
      return 'secondary';
    case 'info':
      return 'outline';
  }
}

/**
 * Get background color for severity
 */
function getSeverityBgColor(severity: Finding['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-50 border-red-200';
    case 'major':
      return 'bg-orange-50 border-orange-200';
    case 'minor':
      return 'bg-yellow-50 border-yellow-200';
    case 'info':
      return 'bg-blue-50 border-blue-200';
  }
}

/**
 * FindingsPanel Component
 * 
 * Displays findings in a list with severity indicators.
 * Order is preserved from API (deterministic by severity then field).
 */
export function FindingsPanel({ findings, className }: FindingsPanelProps) {
  if (findings.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Findings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            No findings to display
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group findings by severity for summary
  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    major: findings.filter(f => f.severity === 'major').length,
    minor: findings.filter(f => f.severity === 'minor').length,
    info: findings.filter(f => f.severity === 'info').length,
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Findings ({findings.length})</CardTitle>
          <div className="flex gap-2">
            {summary.critical > 0 && (
              <Badge variant="destructive">{summary.critical} Critical</Badge>
            )}
            {summary.major > 0 && (
              <Badge variant="default">{summary.major} Major</Badge>
            )}
            {summary.minor > 0 && (
              <Badge variant="secondary">{summary.minor} Minor</Badge>
            )}
            {summary.info > 0 && (
              <Badge variant="outline">{summary.info} Info</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {findings.map((finding) => (
            <div
              key={finding.id}
              className={cn(
                'rounded-lg border p-4',
                getSeverityBgColor(finding.severity)
              )}
            >
              <div className="flex items-start gap-3">
                {getSeverityIcon(finding.severity)}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{finding.field}</span>
                    <Badge variant={getSeverityBadgeVariant(finding.severity)}>
                      {finding.severity}
                    </Badge>
                    <span className="text-sm text-muted-foreground font-mono">
                      {finding.ruleId}
                    </span>
                  </div>
                  <p className="text-sm">{finding.message}</p>
                  {(finding.extractedValue || finding.expectedPattern) && (
                    <div className="mt-2 text-sm">
                      {finding.extractedValue && (
                        <div>
                          <span className="font-medium">Extracted: </span>
                          <code className="bg-muted px-1 rounded">
                            {finding.extractedValue}
                          </code>
                        </div>
                      )}
                      {finding.expectedPattern && (
                        <div>
                          <span className="font-medium">Expected: </span>
                          <code className="bg-muted px-1 rounded">
                            {finding.expectedPattern}
                          </code>
                        </div>
                      )}
                    </div>
                  )}
                  {finding.pageNumber && (
                    <div className="text-xs text-muted-foreground">
                      Page {finding.pageNumber}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default FindingsPanel;

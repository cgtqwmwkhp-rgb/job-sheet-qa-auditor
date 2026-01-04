/**
 * AuditViewer Component - Stage 6
 * 
 * Main audit result viewer that combines ValidatedFieldsTable,
 * FindingsPanel, and ExportButton.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ValidatedFieldsTable, type ValidatedField, type FieldTab } from './ValidatedFieldsTable';
import { FindingsPanel, type Finding } from './FindingsPanel';
import { ExportButton, type ExportOptions } from './ExportButton';

/**
 * Review queue reason codes (canonical)
 */
export type ReviewQueueReasonCode = 'LOW_CONFIDENCE' | 'UNREADABLE_FIELD' | 'CONFLICT';

/**
 * Audit result data structure (matches API response)
 */
export interface AuditResult {
  id: number;
  jobSheetId: number;
  goldSpecId: number;
  overallResult: 'pass' | 'fail';
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  validatedFields: ValidatedField[];
  findings: Finding[];
  reviewQueueReasons: ReviewQueueReasonCode[];
  metadata: {
    processingTimeMs: number;
    specVersion: string;
    extractionVersion: string;
  };
  createdAt: string;
}

/**
 * Props for AuditViewer
 */
export interface AuditViewerProps {
  audit: AuditResult;
  onExport: (options: ExportOptions) => Promise<void>;
  onTabChange?: (tab: FieldTab) => void;
  className?: string;
}

/**
 * Get result icon and color
 */
function getResultDisplay(result: AuditResult['overallResult']) {
  if (result === 'pass') {
    return {
      icon: <CheckCircle className="h-6 w-6 text-green-500" />,
      label: 'Passed',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    };
  }
  return {
    icon: <XCircle className="h-6 w-6 text-red-500" />,
    label: 'Failed',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  };
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

/**
 * Format duration in ms
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Get reason code display label
 */
function getReasonCodeLabel(code: ReviewQueueReasonCode): string {
  switch (code) {
    case 'LOW_CONFIDENCE':
      return 'Low Confidence';
    case 'UNREADABLE_FIELD':
      return 'Unreadable Field';
    case 'CONFLICT':
      return 'Conflict';
  }
}

/**
 * AuditViewer Component
 * 
 * Main component for viewing audit results.
 */
export function AuditViewer({
  audit,
  onExport,
  onTabChange,
  className,
}: AuditViewerProps) {
  const resultDisplay = getResultDisplay(audit.overallResult);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn('rounded-lg p-3', resultDisplay.bgColor)}>
                {resultDisplay.icon}
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Audit #{audit.id}
                  <Badge
                    variant={audit.overallResult === 'pass' ? 'default' : 'destructive'}
                  >
                    {resultDisplay.label}
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Job Sheet #{audit.jobSheetId} • Spec v{audit.metadata.specVersion}
                </p>
              </div>
            </div>
            <ExportButton auditId={audit.id} onExport={onExport} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-green-600">
                {audit.passedCount}
              </div>
              <div className="text-sm text-muted-foreground">Passed</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-red-600">
                {audit.failedCount}
              </div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-gray-600">
                {audit.skippedCount}
              </div>
              <div className="text-sm text-muted-foreground">Skipped</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold">
                {audit.validatedFields.length}
              </div>
              <div className="text-sm text-muted-foreground">Total Fields</div>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Metadata */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatDate(audit.createdAt)}
            </div>
            <div>
              Processing: {formatDuration(audit.metadata.processingTimeMs)}
            </div>
            <div>
              Extraction v{audit.metadata.extractionVersion}
            </div>
          </div>

          {/* Review queue reasons */}
          {audit.reviewQueueReasons.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium mb-2">Review Queue Reasons:</div>
              <div className="flex flex-wrap gap-2">
                {audit.reviewQueueReasons.map((reason) => (
                  <Badge key={reason} variant="outline">
                    {getReasonCodeLabel(reason)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Validated Fields Table */}
      <Card>
        <CardHeader>
          <CardTitle>Validated Fields</CardTitle>
        </CardHeader>
        <CardContent>
          <ValidatedFieldsTable
            fields={audit.validatedFields}
            onTabChange={onTabChange}
          />
        </CardContent>
      </Card>

      {/* Findings Panel */}
      {audit.findings.length > 0 && (
        <FindingsPanel findings={audit.findings} />
      )}
    </div>
  );
}

export default AuditViewer;

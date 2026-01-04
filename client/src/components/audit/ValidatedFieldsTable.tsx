/**
 * ValidatedFieldsTable Component - Stage 6
 * 
 * Displays validated fields with tab filtering (All, Passed, Failed).
 * Maintains deterministic ordering from API.
 */

import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Validated field data structure (matches API response)
 */
export interface ValidatedField {
  ruleId: string;
  field: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  value: string | number | boolean | null;
  confidence: number;
  pageNumber?: number;
  severity: 'critical' | 'major' | 'minor' | 'info';
  message?: string;
}

/**
 * Tab type for filtering
 */
export type FieldTab = 'all' | 'passed' | 'failed';

/**
 * Props for ValidatedFieldsTable
 */
export interface ValidatedFieldsTableProps {
  fields: ValidatedField[];
  defaultTab?: FieldTab;
  onTabChange?: (tab: FieldTab) => void;
  className?: string;
}

/**
 * Get badge variant based on status
 */
function getStatusBadgeVariant(status: ValidatedField['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'passed':
      return 'default';
    case 'failed':
    case 'error':
      return 'destructive';
    case 'skipped':
      return 'secondary';
    default:
      return 'outline';
  }
}

/**
 * Get severity badge color
 */
function getSeverityColor(severity: ValidatedField['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'major':
      return 'bg-orange-100 text-orange-800';
    case 'minor':
      return 'bg-yellow-100 text-yellow-800';
    case 'info':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Format value for display
 */
function formatValue(value: ValidatedField['value']): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

/**
 * ValidatedFieldsTable Component
 * 
 * Displays validated fields with tab filtering.
 * Order is preserved from API (deterministic by ruleId).
 */
export function ValidatedFieldsTable({
  fields,
  defaultTab = 'all',
  onTabChange,
  className,
}: ValidatedFieldsTableProps) {
  const [activeTab, setActiveTab] = useState<FieldTab>(defaultTab);

  // Filter fields based on active tab
  const filteredFields = useMemo(() => {
    switch (activeTab) {
      case 'passed':
        return fields.filter(f => f.status === 'passed');
      case 'failed':
        return fields.filter(f => f.status === 'failed' || f.status === 'error');
      default:
        return fields;
    }
  }, [fields, activeTab]);

  // Count fields by status
  const counts = useMemo(() => ({
    all: fields.length,
    passed: fields.filter(f => f.status === 'passed').length,
    failed: fields.filter(f => f.status === 'failed' || f.status === 'error').length,
  }), [fields]);

  const handleTabChange = (value: string) => {
    const tab = value as FieldTab;
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">
            All ({counts.all})
          </TabsTrigger>
          <TabsTrigger value="passed">
            Passed ({counts.passed})
          </TabsTrigger>
          <TabsTrigger value="failed">
            Failed ({counts.failed})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Rule ID</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="w-[100px]">Confidence</TableHead>
                  <TableHead className="w-[80px]">Page</TableHead>
                  <TableHead className="w-[80px]">Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFields.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No fields to display
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFields.map((field) => (
                    <TableRow key={field.ruleId}>
                      <TableCell className="font-mono text-sm">
                        {field.ruleId}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{field.field}</div>
                          {field.message && (
                            <div className="text-sm text-muted-foreground">
                              {field.message}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(field.status)}>
                          {field.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {formatValue(field.value)}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'font-medium',
                          field.confidence >= 0.9 ? 'text-green-600' :
                          field.confidence >= 0.7 ? 'text-yellow-600' :
                          'text-red-600'
                        )}>
                          {(field.confidence * 100).toFixed(0)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        {field.pageNumber ?? '-'}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
                          getSeverityColor(field.severity)
                        )}>
                          {field.severity}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ValidatedFieldsTable;

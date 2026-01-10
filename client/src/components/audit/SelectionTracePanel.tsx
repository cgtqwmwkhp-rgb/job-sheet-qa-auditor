/**
 * SelectionTracePanel Component - PR-2
 * 
 * Displays template selection trace for explainability.
 * Shows how the template was selected, candidates considered,
 * confidence bands, and any manual overrides.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, FileSearch, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Confidence band type
 */
export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/**
 * Template candidate in selection trace
 */
export interface TemplateCandidate {
  templateId: string;
  templateName: string;
  version: string;
  score: number;
  matchedTokens: string[];
  missingTokens: string[];
}

/**
 * Selection trace data structure
 */
export interface SelectionTrace {
  /** Input signals used for selection */
  inputSignals: {
    tokens: string[];
    documentType?: string;
    customerId?: string;
  };
  /** Sorted candidates (score desc, templateId asc) */
  candidates: TemplateCandidate[];
  /** Selected template/version (null if blocked) */
  selected: {
    templateId: string;
    templateName: string;
    version: string;
  } | null;
  /** Block reason if selection was blocked */
  blockReason?: string;
  /** Confidence band */
  confidenceBand: ConfidenceBand;
  /** Gap between top candidate and runner-up */
  runnerUpDelta: number;
  /** Manual override if applied */
  override?: {
    templateId: string;
    version: string;
    overriddenBy: string;
    reason: string;
  };
  /** Timestamp of selection */
  timestamp: string;
}

/**
 * Props for SelectionTracePanel
 */
export interface SelectionTracePanelProps {
  trace: SelectionTrace | null;
  className?: string;
  defaultOpen?: boolean;
}

/**
 * Get confidence band display
 */
function getConfidenceDisplay(band: ConfidenceBand) {
  switch (band) {
    case 'HIGH':
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
        label: 'High Confidence',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
      };
    case 'MEDIUM':
      return {
        icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
        label: 'Medium Confidence',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
      };
    case 'LOW':
      return {
        icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
        label: 'Low Confidence',
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
      };
    case 'NONE':
      return {
        icon: <XCircle className="h-4 w-4 text-red-500" />,
        label: 'No Match',
        color: 'text-red-600',
        bgColor: 'bg-red-100',
      };
  }
}

/**
 * SelectionTracePanel Component
 * 
 * Displays deterministic template selection trace for audit transparency.
 */
export function SelectionTracePanel({
  trace,
  className,
  defaultOpen = false,
}: SelectionTracePanelProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  if (!trace) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-5 w-5" />
            Template Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Selection trace not available for this audit.
          </p>
        </CardContent>
      </Card>
    );
  }

  const confidenceDisplay = getConfidenceDisplay(trace.confidenceBand);

  return (
    <Card className={className}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSearch className="h-5 w-5" />
                Template Selection Trace
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge className={cn('text-xs', confidenceDisplay.bgColor, confidenceDisplay.color)}>
                  {confidenceDisplay.label}
                </Badge>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Override Notice */}
            {trace.override && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <div className="flex items-center gap-2 text-blue-700 font-medium mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  Manual Override Applied
                </div>
                <div className="text-sm text-blue-600">
                  Template manually set to <strong>{trace.override.templateId}</strong> v{trace.override.version}
                  <br />
                  By: {trace.override.overriddenBy}
                  <br />
                  Reason: {trace.override.reason}
                </div>
              </div>
            )}

            {/* Block Reason */}
            {trace.blockReason && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <div className="flex items-center gap-2 text-red-700 font-medium mb-1">
                  <XCircle className="h-4 w-4" />
                  Selection Blocked
                </div>
                <div className="text-sm text-red-600">
                  {trace.blockReason}
                </div>
              </div>
            )}

            {/* Selected Template */}
            {trace.selected && (
              <div>
                <div className="text-sm font-medium mb-2">Selected Template</div>
                <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                  <div className="font-medium text-green-700">
                    {trace.selected.templateName}
                  </div>
                  <div className="text-sm text-green-600">
                    ID: {trace.selected.templateId} • Version: {trace.selected.version}
                  </div>
                </div>
              </div>
            )}

            {/* Input Signals */}
            <div>
              <div className="text-sm font-medium mb-2">Input Signals</div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>
                  <span className="font-medium">Tokens:</span>{' '}
                  {trace.inputSignals.tokens.length > 0 ? (
                    <span className="inline-flex flex-wrap gap-1 ml-1">
                      {trace.inputSignals.tokens.slice(0, 10).map((token, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {token}
                        </Badge>
                      ))}
                      {trace.inputSignals.tokens.length > 10 && (
                        <Badge variant="secondary" className="text-xs">
                          +{trace.inputSignals.tokens.length - 10} more
                        </Badge>
                      )}
                    </span>
                  ) : (
                    '(none extracted)'
                  )}
                </div>
                {trace.inputSignals.documentType && (
                  <div>
                    <span className="font-medium">Document Type:</span>{' '}
                    {trace.inputSignals.documentType}
                  </div>
                )}
                {trace.inputSignals.customerId && (
                  <div>
                    <span className="font-medium">Customer ID:</span>{' '}
                    {trace.inputSignals.customerId}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Confidence Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-1">
                  {confidenceDisplay.icon}
                  <span className={cn('font-medium', confidenceDisplay.color)}>
                    {trace.confidenceBand}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Confidence Band
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="font-medium">
                  {trace.runnerUpDelta.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Runner-up Gap
                </div>
              </div>
            </div>

            <Separator />

            {/* Candidates Table */}
            <div>
              <div className="text-sm font-medium mb-2">
                Candidates Considered ({trace.candidates.length})
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">#</th>
                      <th className="text-left p-2 font-medium">Template</th>
                      <th className="text-left p-2 font-medium">Version</th>
                      <th className="text-right p-2 font-medium">Score</th>
                      <th className="text-left p-2 font-medium">Matched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trace.candidates.slice(0, 5).map((candidate, index) => (
                      <tr
                        key={`${candidate.templateId}-${candidate.version}`}
                        className={cn(
                          'border-t',
                          index === 0 && trace.selected?.templateId === candidate.templateId
                            ? 'bg-green-50'
                            : ''
                        )}
                      >
                        <td className="p-2 text-muted-foreground">{index + 1}</td>
                        <td className="p-2 font-medium">{candidate.templateId}</td>
                        <td className="p-2">{candidate.version}</td>
                        <td className="p-2 text-right font-mono">{candidate.score.toFixed(1)}</td>
                        <td className="p-2">
                          <span className="inline-flex flex-wrap gap-1">
                            {candidate.matchedTokens.slice(0, 3).map((token, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {token}
                              </Badge>
                            ))}
                            {candidate.matchedTokens.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{candidate.matchedTokens.length - 3}
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {trace.candidates.length > 5 && (
                      <tr className="border-t bg-muted/30">
                        <td colSpan={5} className="p-2 text-center text-muted-foreground text-xs">
                          +{trace.candidates.length - 5} more candidates not shown
                        </td>
                      </tr>
                    )}
                    {trace.candidates.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-muted-foreground">
                          No matching candidates found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Timestamp */}
            <div className="text-xs text-muted-foreground text-right">
              Selection performed: {new Date(trace.timestamp).toLocaleString()}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default SelectionTracePanel;

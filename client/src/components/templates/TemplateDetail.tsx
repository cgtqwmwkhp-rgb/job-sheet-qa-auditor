/**
 * Template Detail Component
 * 
 * Displays detailed template information including fields, rules, and metrics.
 */

import React, { useState } from 'react';
import { StatusBadge, PassRateIndicator } from './TemplateList';

// ============================================================================
// Types
// ============================================================================

export interface FieldRule {
  field: string;
  label: string;
  required: boolean;
  type: string;
  description?: string;
  roi?: {
    page: number;
    region: { x: number; y: number; width: number; height: number };
  };
}

export interface ValidationRule {
  ruleId: string;
  field: string;
  type: string;
  description?: string;
  severity?: 'critical' | 'major' | 'minor';
}

export interface TemplateDetailData {
  templateId: string;
  displayName: string;
  version: string;
  versionHash: string;
  documentType: string;
  client: string;
  description?: string;
  status: 'active' | 'pending' | 'inactive' | 'deprecated';
  fieldRules: FieldRule[];
  validationRules: ValidationRule[];
  selection?: {
    method: string;
    requiredTokensAll?: string[];
    requiredTokensAny?: string[];
    formCodeRegex?: string;
  };
  metrics?: {
    passRate: number;
    selectionCount: number;
    avgValidationDurationMs: number;
    overrideRate: number;
    reasonCodeDistribution: Record<string, number>;
  };
  approvalHistory?: Array<{
    timestamp: string;
    action: string;
    actor: string;
    note: string;
  }>;
}

export interface TemplateDetailProps {
  template: TemplateDetailData;
  onClose: () => void;
  onApprove?: (note: string) => void;
  onReject?: (note: string) => void;
  onActivate?: () => void;
  onDeprecate?: () => void;
}

// ============================================================================
// Tab Components
// ============================================================================

type TabId = 'overview' | 'fields' | 'rules' | 'selection' | 'metrics' | 'history';

interface TabProps {
  id: TabId;
  label: string;
  active: boolean;
  onClick: () => void;
}

function Tab({ id, label, active, onClick }: TabProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

// ============================================================================
// Field List Component
// ============================================================================

interface FieldListProps {
  fields: FieldRule[];
}

function FieldList({ fields }: FieldListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Field</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Required</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ROI</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {fields.map((field) => (
            <tr key={field.field} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-mono text-gray-900">{field.field}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{field.label}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{field.type}</td>
              <td className="px-4 py-3">
                {field.required ? (
                  <span className="text-red-600 text-sm font-medium">Required</span>
                ) : (
                  <span className="text-gray-400 text-sm">Optional</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {field.roi ? (
                  <span className="text-green-600">Page {field.roi.page}</span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Rule List Component
// ============================================================================

interface RuleListProps {
  rules: ValidationRule[];
}

function RuleList({ rules }: RuleListProps) {
  const severityColors = {
    critical: 'bg-red-100 text-red-800',
    major: 'bg-yellow-100 text-yellow-800',
    minor: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rule ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Field</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rules.map((rule) => (
            <tr key={rule.ruleId} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-mono text-gray-900">{rule.ruleId}</td>
              <td className="px-4 py-3 text-sm font-mono text-gray-700">{rule.field}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{rule.type}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityColors[rule.severity || 'minor']}`}>
                  {rule.severity || 'minor'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">{rule.description || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Selection Criteria Component
// ============================================================================

interface SelectionCriteriaProps {
  selection?: TemplateDetailData['selection'];
}

function SelectionCriteria({ selection }: SelectionCriteriaProps) {
  if (!selection) {
    return (
      <div className="text-center py-8 text-gray-500">
        No selection criteria configured. Manual selection only.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Selection Method</h4>
        <p className="text-sm text-gray-900">{selection.method}</p>
      </div>

      {selection.requiredTokensAll && selection.requiredTokensAll.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Required Tokens (ALL)</h4>
          <div className="flex flex-wrap gap-2">
            {selection.requiredTokensAll.map((token, i) => (
              <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                {token}
              </span>
            ))}
          </div>
        </div>
      )}

      {selection.requiredTokensAny && selection.requiredTokensAny.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Required Tokens (ANY)</h4>
          <div className="flex flex-wrap gap-2">
            {selection.requiredTokensAny.map((token, i) => (
              <span key={i} className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                {token}
              </span>
            ))}
          </div>
        </div>
      )}

      {selection.formCodeRegex && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Form Code Pattern</h4>
          <code className="text-sm bg-gray-100 px-2 py-1 rounded">{selection.formCodeRegex}</code>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Metrics Component
// ============================================================================

interface MetricsProps {
  metrics?: TemplateDetailData['metrics'];
}

function Metrics({ metrics }: MetricsProps) {
  if (!metrics) {
    return (
      <div className="text-center py-8 text-gray-500">
        No metrics available yet. Process some documents to see metrics.
      </div>
    );
  }

  const topReasonCodes = Object.entries(metrics.reasonCodeDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-500">Pass Rate</h4>
          <p className="text-2xl font-bold mt-1">
            <PassRateIndicator rate={metrics.passRate} />
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-500">Documents</h4>
          <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.selectionCount}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-500">Avg Duration</h4>
          <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.avgValidationDurationMs}ms</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-500">Override Rate</h4>
          <p className="text-2xl font-bold text-gray-900 mt-1">{Math.round(metrics.overrideRate * 100)}%</p>
        </div>
      </div>

      {/* Reason Code Distribution */}
      {topReasonCodes.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Top Reason Codes</h4>
          <div className="space-y-2">
            {topReasonCodes.map(([code, count]) => (
              <div key={code} className="flex items-center">
                <span className="text-sm font-mono text-gray-700 w-40">{code}</span>
                <div className="flex-1 mx-3">
                  <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(count / metrics.selectionCount) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm text-gray-500 w-12 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Approval History Component
// ============================================================================

interface ApprovalHistoryProps {
  history?: TemplateDetailData['approvalHistory'];
}

function ApprovalHistory({ history }: ApprovalHistoryProps) {
  if (!history || history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No approval history available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {history.map((entry, i) => (
        <div key={i} className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900">{entry.action}</span>
            <span className="text-xs text-gray-500">
              {new Date(entry.timestamp).toLocaleString()}
            </span>
          </div>
          <p className="text-sm text-gray-600">{entry.note}</p>
          <p className="text-xs text-gray-400 mt-1">by {entry.actor}</p>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Template Detail Component
// ============================================================================

export function TemplateDetail({
  template,
  onClose,
  onApprove,
  onReject,
  onActivate,
  onDeprecate,
}: TemplateDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [approvalNote, setApprovalNote] = useState('');

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'fields', label: `Fields (${template.fieldRules.length})` },
    { id: 'rules', label: `Rules (${template.validationRules.length})` },
    { id: 'selection', label: 'Selection' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="template-detail bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{template.displayName}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {template.templateId} • v{template.version} • {template.versionHash.substring(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={template.status} />
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-gray-200">
        <div className="flex space-x-4">
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              id={tab.id}
              label={tab.label}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-h-96 overflow-y-auto">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">Client</h4>
                <p className="text-sm text-gray-900">{template.client}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Document Type</h4>
                <p className="text-sm text-gray-900">{template.documentType}</p>
              </div>
            </div>
            {template.description && (
              <div>
                <h4 className="text-sm font-medium text-gray-500">Description</h4>
                <p className="text-sm text-gray-900">{template.description}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'fields' && <FieldList fields={template.fieldRules} />}
        {activeTab === 'rules' && <RuleList rules={template.validationRules} />}
        {activeTab === 'selection' && <SelectionCriteria selection={template.selection} />}
        {activeTab === 'metrics' && <Metrics metrics={template.metrics} />}
        {activeTab === 'history' && <ApprovalHistory history={template.approvalHistory} />}
      </div>

      {/* Actions */}
      {template.status === 'pending' && (onApprove || onReject) && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Approval Note
            </label>
            <textarea
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              rows={2}
              placeholder="Add a note for this approval decision..."
            />
          </div>
          <div className="flex justify-end gap-3">
            {onReject && (
              <button
                onClick={() => onReject(approvalNote)}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
              >
                Reject
              </button>
            )}
            {onApprove && (
              <button
                onClick={() => onApprove(approvalNote)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Approve
              </button>
            )}
          </div>
        </div>
      )}

      {template.status === 'active' && onDeprecate && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onDeprecate}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
            >
              Deprecate Template
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TemplateDetail;

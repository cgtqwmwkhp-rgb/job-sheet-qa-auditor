/**
 * Template List Component
 * 
 * Displays all templates with status indicators and filtering.
 */

import React, { useState, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface Template {
  templateId: string;
  displayName: string;
  version: string;
  documentType: string;
  client: string;
  status: 'active' | 'pending' | 'inactive' | 'deprecated';
  fieldCount: number;
  ruleCount: number;
  lastUpdated: string;
  passRate?: number;
  selectionCount?: number;
}

export interface TemplateListProps {
  templates: Template[];
  onSelectTemplate: (templateId: string) => void;
  onApproveTemplate?: (templateId: string) => void;
  selectedTemplateId?: string;
}

// ============================================================================
// Status Badge Component
// ============================================================================

interface StatusBadgeProps {
  status: Template['status'];
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<Template['status'], { bg: string; text: string; label: string }> = {
    active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
    inactive: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Inactive' },
    deprecated: { bg: 'bg-red-100', text: 'text-red-800', label: 'Deprecated' },
  };

  const style = styles[status];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

// ============================================================================
// Pass Rate Indicator Component
// ============================================================================

interface PassRateIndicatorProps {
  rate?: number;
}

export function PassRateIndicator({ rate }: PassRateIndicatorProps) {
  if (rate === undefined) {
    return <span className="text-gray-400 text-sm">No data</span>;
  }

  const percentage = Math.round(rate * 100);
  let colorClass = 'text-green-600';
  if (percentage < 70) colorClass = 'text-red-600';
  else if (percentage < 85) colorClass = 'text-yellow-600';

  return (
    <span className={`font-medium ${colorClass}`}>
      {percentage}%
    </span>
  );
}

// ============================================================================
// Template List Component
// ============================================================================

export function TemplateList({
  templates,
  onSelectTemplate,
  onApproveTemplate,
  selectedTemplateId,
}: TemplateListProps) {
  const [filter, setFilter] = useState<'all' | Template['status']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'passRate' | 'updated'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Filter and sort templates
  const filteredTemplates = useMemo(() => {
    let result = templates;

    // Apply status filter
    if (filter !== 'all') {
      result = result.filter(t => t.status === filter);
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.displayName.toLowerCase().includes(query) ||
        t.templateId.toLowerCase().includes(query) ||
        t.client.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.displayName.localeCompare(b.displayName);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'passRate':
          comparison = (a.passRate ?? 0) - (b.passRate ?? 0);
          break;
        case 'updated':
          comparison = a.lastUpdated.localeCompare(b.lastUpdated);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [templates, filter, searchQuery, sortBy, sortOrder]);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const statusCounts = useMemo(() => {
    return {
      all: templates.length,
      active: templates.filter(t => t.status === 'active').length,
      pending: templates.filter(t => t.status === 'pending').length,
      inactive: templates.filter(t => t.status === 'inactive').length,
      deprecated: templates.filter(t => t.status === 'deprecated').length,
    };
  }, [templates]);

  return (
    <div className="template-list">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Template Management</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage document templates, view metrics, and approve new versions.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-4">
        {/* Search */}
        <div className="flex-1 min-w-64">
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {(['all', 'active', 'pending', 'inactive', 'deprecated'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)} ({statusCounts[status]})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                Template {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('status')}
              >
                Status {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fields / Rules
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('passRate')}
              >
                Pass Rate {sortBy === 'passRate' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usage
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('updated')}
              >
                Updated {sortBy === 'updated' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTemplates.map((template) => (
              <tr
                key={template.templateId}
                className={`hover:bg-gray-50 cursor-pointer ${
                  selectedTemplateId === template.templateId ? 'bg-blue-50' : ''
                }`}
                onClick={() => onSelectTemplate(template.templateId)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col">
                    <div className="text-sm font-medium text-gray-900">
                      {template.displayName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {template.templateId} • v{template.version}
                    </div>
                    <div className="text-xs text-gray-400">
                      {template.client}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={template.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {template.fieldCount} / {template.ruleCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <PassRateIndicator rate={template.passRate} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {template.selectionCount ?? 0} docs
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(template.lastUpdated).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {template.status === 'pending' && onApproveTemplate && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onApproveTemplate(template.templateId);
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      Approve
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTemplate(template.templateId);
                    }}
                    className="text-gray-600 hover:text-gray-900"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredTemplates.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No templates found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
}

export default TemplateList;

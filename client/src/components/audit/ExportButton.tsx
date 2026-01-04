/**
 * ExportButton Component - Stage 6
 * 
 * Provides export functionality with redacted-by-default behavior.
 * Supports CSV and JSON bundle exports.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, FileJson, FileSpreadsheet, Shield, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json';

/**
 * Export tab options
 */
export type ExportTab = 'all' | 'passed' | 'failed';

/**
 * Props for ExportButton
 */
export interface ExportButtonProps {
  auditId: number;
  onExport: (options: ExportOptions) => Promise<void>;
  className?: string;
  disabled?: boolean;
}

/**
 * Export options
 */
export interface ExportOptions {
  auditId: number;
  format: ExportFormat;
  tab: ExportTab;
  redacted: boolean;
}

/**
 * ExportButton Component
 * 
 * Provides export functionality with confirmation dialog for unredacted exports.
 * Redacted by default for PII safety.
 */
export function ExportButton({
  auditId,
  onExport,
  className,
  disabled = false,
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingExport, setPendingExport] = useState<ExportOptions | null>(null);
  const [includeUnredacted, setIncludeUnredacted] = useState(false);

  const handleExport = async (format: ExportFormat, tab: ExportTab, redacted: boolean) => {
    // If requesting unredacted export, show confirmation dialog
    if (!redacted) {
      setPendingExport({ auditId, format, tab, redacted });
      setShowConfirmDialog(true);
      return;
    }

    // Proceed with redacted export
    await executeExport({ auditId, format, tab, redacted });
  };

  const executeExport = async (options: ExportOptions) => {
    setIsExporting(true);
    try {
      await onExport(options);
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfirmUnredacted = async () => {
    if (pendingExport) {
      setShowConfirmDialog(false);
      await executeExport(pendingExport);
      setPendingExport(null);
      setIncludeUnredacted(false);
    }
  };

  const handleCancelUnredacted = () => {
    setShowConfirmDialog(false);
    setPendingExport(null);
    setIncludeUnredacted(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn('gap-2', className)}
            disabled={disabled || isExporting}
          >
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Redacted exports (default) */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Redacted (PII Safe)
          </div>
          <DropdownMenuItem onClick={() => handleExport('csv', 'all', true)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            All Fields (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('csv', 'passed', true)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Passed Fields (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('csv', 'failed', true)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Failed Fields (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('json', 'all', true)}>
            <FileJson className="mr-2 h-4 w-4" />
            Full Bundle (JSON)
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Unredacted exports (requires confirmation) */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <ShieldOff className="h-3 w-3" />
            Unredacted (Contains PII)
          </div>
          <DropdownMenuItem
            onClick={() => handleExport('csv', 'all', false)}
            className="text-orange-600"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            All Fields (Unredacted)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleExport('json', 'all', false)}
            className="text-orange-600"
          >
            <FileJson className="mr-2 h-4 w-4" />
            Full Bundle (Unredacted)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirmation dialog for unredacted exports */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldOff className="h-5 w-5 text-orange-500" />
              Export Unredacted Data
            </DialogTitle>
            <DialogDescription>
              You are about to export data that may contain personally identifiable
              information (PII) such as names, email addresses, phone numbers, and
              other sensitive data.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-4 text-sm">
              <p className="font-medium text-orange-800">
                This export will include unredacted data.
              </p>
              <ul className="mt-2 list-disc list-inside text-orange-700 space-y-1">
                <li>Handle this data according to your organization's data protection policies</li>
                <li>Do not share this file via unsecured channels</li>
                <li>Delete the file when no longer needed</li>
              </ul>
            </div>

            <div className="mt-4 flex items-center space-x-2">
              <Checkbox
                id="confirm-unredacted"
                checked={includeUnredacted}
                onCheckedChange={(checked) => setIncludeUnredacted(checked === true)}
              />
              <Label htmlFor="confirm-unredacted" className="text-sm">
                I understand the risks and will handle this data responsibly
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancelUnredacted}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmUnredacted}
              disabled={!includeUnredacted}
            >
              Export Unredacted
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ExportButton;

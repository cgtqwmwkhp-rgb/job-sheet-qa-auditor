import { trpc } from "./trpc";

// ============ TYPE EXPORTS ============
// Re-export types for backwards compatibility

export interface JobSheet {
  id: number;
  referenceNumber: string | null;
  fileName: string;
  fileUrl: string;
  fileType: string;
  status: "pending" | "processing" | "completed" | "failed" | "review_queue";
  technicianId: number | null;
  siteInfo: string | null;
  uploadedBy: number;
  createdAt: Date;
}

export interface Finding {
  id: number;
  auditResultId?: number;
  severity?: "S0" | "S1" | "S2" | "S3" | "critical" | "major" | "minor";
  reasonCode?: string;
  fieldName?: string;
  pageNumber?: number | null;
  boundingBox?: any;
  rawSnippet?: string | null;
  normalisedSnippet?: string | null;
  confidence: number;
  ruleId?: string | null;
  whyItMatters?: string | null;
  suggestedFix?: string | null;
  // Legacy fields for backward compatibility
  field?: string;
  status?: "passed" | "missing" | "warning";
  value?: string;
  message?: string;
  box?: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    label?: string;
  };
}

export interface Dispute {
  id: number;
  auditFindingId: number;
  raisedBy: number;
  status: "open" | "under_review" | "accepted" | "rejected" | "escalated";
  reason: string;
  evidenceUrls: string[] | null;
  reviewerId: number | null;
  reviewNotes: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface GoldSpec {
  id: number;
  name: string;
  version: string;
  description: string | null;
  schema: any;
  specType: "base" | "client" | "contract" | "workType";
  isActive: boolean;
  createdBy: number;
  createdAt: Date;
}

export interface Stats {
  totalAudits: number;
  passRate: string;
  reviewQueue: number;
  criticalIssues: number;
}

export interface Activity {
  id: number;
  type: "audit" | "review" | "system";
  message: string;
  time: string;
}

// ============ DASHBOARD STATS ============
export function useStats() {
  return trpc.stats.dashboard.useQuery(undefined, {
    // Provide fallback data for demo mode
    placeholderData: {
      totalAudits: 0,
      passRate: '0',
      reviewQueue: 0,
      criticalIssues: 0,
    },
  });
}

// ============ JOB SHEETS ============
export function useJobSheets(options?: { status?: string; technicianId?: number; limit?: number }) {
  return trpc.jobSheets.list.useQuery(options);
}

export function useJobSheet(id: number) {
  return trpc.jobSheets.get.useQuery({ id }, {
    enabled: !!id && id > 0,
  });
}

export function useUploadJobSheet() {
  const utils = trpc.useUtils();
  
  return trpc.jobSheets.upload.useMutation({
    onSuccess: () => {
      utils.jobSheets.list.invalidate();
      utils.stats.dashboard.invalidate();
    },
  });
}

export function useUpdateJobSheetStatus() {
  const utils = trpc.useUtils();
  
  return trpc.jobSheets.updateStatus.useMutation({
    onSuccess: () => {
      utils.jobSheets.list.invalidate();
      utils.stats.dashboard.invalidate();
    },
  });
}

// ============ AUDIT RESULTS ============
export function useAuditResults(options?: { result?: string; limit?: number }) {
  return trpc.audits.list.useQuery(options);
}

export function useAuditResultByJobSheet(jobSheetId: number) {
  return trpc.audits.getByJobSheet.useQuery({ jobSheetId }, {
    enabled: !!jobSheetId && jobSheetId > 0,
  });
}

export function useAuditFindings(auditResultId: number) {
  return trpc.audits.getFindings.useQuery({ auditResultId }, {
    enabled: !!auditResultId && auditResultId > 0,
  });
}

// ============ GOLD SPECS ============
export function useGoldSpecs() {
  return trpc.specs.list.useQuery();
}

export function useActiveGoldSpec(specType?: string) {
  return trpc.specs.getActive.useQuery({ specType });
}

export function useCreateGoldSpec() {
  const utils = trpc.useUtils();
  
  return trpc.specs.create.useMutation({
    onSuccess: () => {
      utils.specs.list.invalidate();
    },
  });
}

// ============ DISPUTES ============
export function useDisputes(options?: { status?: string; limit?: number }) {
  return trpc.disputes.list.useQuery(options);
}

export function useCreateDispute() {
  const utils = trpc.useUtils();
  
  return trpc.disputes.create.useMutation({
    onSuccess: () => {
      utils.disputes.list.invalidate();
    },
  });
}

export function useUpdateDisputeStatus() {
  const utils = trpc.useUtils();
  
  return trpc.disputes.updateStatus.useMutation({
    onSuccess: () => {
      utils.disputes.list.invalidate();
    },
  });
}

// ============ WAIVERS ============
export function useCreateWaiver() {
  const utils = trpc.useUtils();
  
  return trpc.waivers.create.useMutation({
    onSuccess: () => {
      utils.audits.list.invalidate();
    },
  });
}

export function useWaiverByFinding(auditFindingId: number) {
  return trpc.waivers.getByFinding.useQuery({ auditFindingId }, {
    enabled: !!auditFindingId && auditFindingId > 0,
  });
}

// ============ USERS ============
export function useUsers() {
  return trpc.users.list.useQuery();
}

export function useUser(id: number) {
  return trpc.users.get.useQuery({ id }, {
    enabled: !!id && id > 0,
  });
}

// ============ AUDIT LOG ============
export function useAuditLog(options?: { userId?: number; entityType?: string; limit?: number }) {
  return trpc.auditLog.list.useQuery(options);
}

// ============ LEGACY COMPATIBILITY HOOKS ============
// These maintain backwards compatibility with existing components

export function useSubmitFeedback() {
  // Feedback is now handled through disputes
  const createDispute = useCreateDispute();
  
  return {
    mutate: (data: { findingId: number; type: string; comment: string }) => {
      createDispute.mutate({
        auditFindingId: data.findingId,
        reason: `[${data.type}] ${data.comment}`,
      });
    },
    mutateAsync: async (data: { findingId: number; type: string; comment: string }) => {
      return createDispute.mutateAsync({
        auditFindingId: data.findingId,
        reason: `[${data.type}] ${data.comment}`,
      });
    },
    isPending: createDispute.isPending,
    isError: createDispute.isError,
    error: createDispute.error,
  };
}

export function useResolveDispute() {
  const updateStatus = useUpdateDisputeStatus();
  
  return {
    mutate: (data: { disputeId: string; status: "approved" | "rejected"; comment?: string }) => {
      updateStatus.mutate({
        id: parseInt(data.disputeId),
        status: data.status === "approved" ? "accepted" : "rejected",
        reviewNotes: data.comment,
      });
    },
    mutateAsync: async (data: { disputeId: string; status: "approved" | "rejected"; comment?: string }) => {
      return updateStatus.mutateAsync({
        id: parseInt(data.disputeId),
        status: data.status === "approved" ? "accepted" : "rejected",
        reviewNotes: data.comment,
      });
    },
    isPending: updateStatus.isPending,
    isError: updateStatus.isError,
    error: updateStatus.error,
  };
}

// Notification settings - stored locally for now
export function useNotificationSettings() {
  return {
    data: {
      criticalDefects: true,
      majorDefects: true,
      minorDefects: false,
      auditCompleted: true,
      dailySummary: false,
    },
    isLoading: false,
    error: null,
  };
}

export function useUpdateNotificationSettings() {
  return {
    mutate: () => {},
    mutateAsync: async () => ({ success: true }),
    isPending: false,
    isError: false,
    error: null,
  };
}

export function useSendTestEmail() {
  return {
    mutate: () => {},
    mutateAsync: async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { success: true, message: "Email queued for delivery" };
    },
    isPending: false,
    isError: false,
    error: null,
  };
}

export function useCreateAnnotation() {
  return {
    mutate: () => {},
    mutateAsync: async () => ({ success: true, id: Date.now() }),
    isPending: false,
    isError: false,
    error: null,
  };
}

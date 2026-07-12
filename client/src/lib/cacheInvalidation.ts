/**
 * Central Cache Invalidation Helpers
 * 
 * Provides consistent cache invalidation patterns across the application.
 * Uses TanStack Query's invalidation API for automatic re-fetching.
 */

import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { trpc } from "./trpc";

/**
 * Hook that returns cache invalidation helpers.
 * Use this in components/mutations for consistent cache management.
 * 
 * @example
 * const { invalidateJobSheets, invalidateAudits } = useCacheInvalidation();
 * await processJob(id);
 * await invalidateJobSheets(); // Auto-refetch all job sheet queries
 */
export function useCacheInvalidation() {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  return {
    /**
     * Invalidate all job sheet queries.
     * Use after: create, update, delete, process, reprocess
     */
    async invalidateJobSheets() {
      await utils.jobSheets.invalidate();
    },

    /**
     * Invalidate a specific job sheet by ID.
     */
    async invalidateJobSheet(id: number) {
      await utils.jobSheets.get.invalidate({ id });
      await utils.jobSheets.getFileUrl.invalidate({ id });
      await utils.jobSheets.processStatus.invalidate({ id });
    },

    /**
     * Invalidate all audit result queries.
     * Use after: audit completion, finding resolution
     */
    async invalidateAudits() {
      await utils.audits.invalidate();
    },

    /**
     * Invalidate audits for a specific job sheet.
     */
    async invalidateAuditsForJobSheet(jobSheetId: number) {
      await utils.audits.getByJobSheet.invalidate({ jobSheetId });
    },

    /**
     * Invalidate findings for a specific audit.
     */
    async invalidateFindings(auditResultId: number) {
      await utils.audits.getFindings.invalidate({ auditResultId });
    },

    /**
     * Invalidate all dispute queries.
     * Use after: create dispute, update status, resolve
     */
    async invalidateDisputes() {
      await utils.disputes.invalidate();
    },

    /**
     * Invalidate user profile queries.
     * Use after: role change, profile update
     */
    async invalidateUsers() {
      await utils.users.invalidate();
    },

    /**
     * Invalidate analytics queries.
     * Use after: bulk data changes, report generation
     */
    async invalidateAnalytics() {
      await utils.analytics?.invalidate();
    },

    /**
     * Invalidate everything (nuclear option).
     * Use sparingly - prefer specific invalidation.
     */
    async invalidateAll() {
      await queryClient.invalidateQueries();
    },

    /**
     * Invalidate related entities after job sheet processing.
     * Convenience method that invalidates the full audit chain.
     */
    async invalidateAfterProcessing(jobSheetId: number) {
      await this.invalidateJobSheet(jobSheetId);
      await this.invalidateAuditsForJobSheet(jobSheetId);
      await this.invalidateJobSheets(); // List view
    },

    /**
     * Invalidate related entities after finding resolution.
     * Convenience method for reviewer actions.
     */
    async invalidateAfterResolution(auditResultId: number, jobSheetId: number) {
      await this.invalidateFindings(auditResultId);
      await this.invalidateAuditsForJobSheet(jobSheetId);
      await this.invalidateJobSheet(jobSheetId);
    },

    /**
     * Invalidate related entities after dispute action.
     */
    async invalidateAfterDispute(auditFindingId: number) {
      await this.invalidateDisputes();
      // Findings query will include dispute status
      // No need to invalidate findings directly
    },
  };
}

/**
 * Query key patterns for manual invalidation.
 * Use these with queryClient.invalidateQueries() if not using the hook.
 */
export const QUERY_KEY_PATTERNS = {
  jobSheets: () => getQueryKey(trpc.jobSheets),
  jobSheet: (id: number) => getQueryKey(trpc.jobSheets.get, { id }),
  audits: () => getQueryKey(trpc.audits),
  auditsByJobSheet: (jobSheetId: number) => 
    getQueryKey(trpc.audits.getByJobSheet, { jobSheetId }),
  findings: (auditResultId: number) => 
    getQueryKey(trpc.audits.getFindings, { auditResultId }),
  disputes: () => getQueryKey(trpc.disputes),
  users: () => getQueryKey(trpc.users),
} as const;

/**
 * Optimistic update helper for instant UI feedback.
 * Rolls back on error.
 * 
 * @example
 * const mutation = useMutation({
 *   mutationFn: updateJobSheet,
 *   onMutate: async (newData) => {
 *     await optimisticUpdate(
 *       queryClient,
 *       ['jobSheets', 'get', { id: newData.id }],
 *       (old) => ({ ...old, ...newData })
 *     );
 *   },
 *   onError: (err, vars, context) => {
 *     queryClient.setQueryData(context.previousData);
 *   }
 * });
 */
export async function optimisticUpdate<T>(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: unknown[],
  updater: (old: T | undefined) => T
): Promise<{ previousData: T | undefined }> {
  // Cancel outgoing refetches
  await queryClient.cancelQueries({ queryKey });

  // Snapshot previous value
  const previousData = queryClient.getQueryData<T>(queryKey);

  // Optimistically update
  queryClient.setQueryData<T>(queryKey, updater);

  return { previousData };
}

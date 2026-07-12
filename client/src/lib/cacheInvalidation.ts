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

/**
 * Selective cache invalidation based on filters.
 * Only invalidates queries matching specific criteria.
 */
export async function invalidateMatchingQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  predicate: (queryKey: unknown[]) => boolean
) {
  await queryClient.invalidateQueries({
    predicate: (query) => predicate(query.queryKey as unknown[]),
  });
}

/**
 * Prefetch data for smoother navigation.
 * Use before navigating to a new page.
 */
export async function prefetchData(
  utils: ReturnType<typeof trpc.useUtils>,
  type: "jobSheet" | "audit" | "user",
  id: number
) {
  switch (type) {
    case "jobSheet":
      await Promise.all([
        utils.jobSheets.get.prefetch({ id }),
        utils.audits.getByJobSheet.prefetch({ jobSheetId: id }),
      ]);
      break;
    case "audit":
      await utils.audits.getFindings.prefetch({ auditResultId: id });
      break;
    case "user":
      await utils.users.get.prefetch({ id });
      break;
  }
}

/**
 * Stale-while-revalidate pattern.
 * Returns stale data immediately while fetching fresh data in background.
 */
export function useStaleWhileRevalidate<T>(
  queryKey: unknown[],
  fetcher: () => Promise<T>,
  staleTime: number = 5000 // 5 seconds
) {
  const queryClient = useQueryClient();
  
  // Try to get cached data
  const cachedData = queryClient.getQueryData<T>(queryKey);
  
  // Fetch fresh data in background if stale
  if (cachedData) {
    const queryState = queryClient.getQueryState(queryKey);
    const isStale = !queryState?.dataUpdatedAt || 
      Date.now() - queryState.dataUpdatedAt > staleTime;
    
    if (isStale) {
      fetcher().then(data => {
        queryClient.setQueryData(queryKey, data);
      }).catch(err => {
        console.error("Background refetch failed:", err);
      });
    }
  }
  
  return cachedData;
}

/**
 * Batch invalidation for multiple entities.
 * More efficient than individual invalidations.
 */
export async function batchInvalidate(
  utils: ReturnType<typeof trpc.useUtils>,
  invalidations: Array<{
    type: "jobSheet" | "audit" | "dispute" | "user" | "all";
    id?: number;
  }>
) {
  const promises = invalidations.map(({ type, id }) => {
    switch (type) {
      case "jobSheet":
        return id ? utils.jobSheets.get.invalidate({ id }) : utils.jobSheets.invalidate();
      case "audit":
        return id ? utils.audits.getByJobSheet.invalidate({ jobSheetId: id }) : utils.audits.invalidate();
      case "dispute":
        return utils.disputes.invalidate();
      case "user":
        return id ? utils.users.get.invalidate({ id }) : utils.users.invalidate();
      case "all":
        return utils.client.invalidateQueries();
      default:
        return Promise.resolve();
    }
  });
  
  await Promise.all(promises);
}

/**
 * Smart cache warming on app startup.
 * Prefetches commonly accessed data.
 */
export async function warmCache(utils: ReturnType<typeof trpc.useUtils>) {
  try {
    // Prefetch dashboard data
    await Promise.all([
      utils.stats.dashboard.prefetch(),
      utils.jobSheets.list.prefetch({ limit: 10 }),
    ]);
  } catch (error) {
    console.error("Cache warming failed:", error);
    // Non-critical, don't block app startup
  }
}

/**
 * Cache cleanup for memory management.
 * Removes old/unused queries.
 */
export function cleanupCache(
  queryClient: ReturnType<typeof useQueryClient>,
  olderThan: number = 30 * 60 * 1000 // 30 minutes
) {
  const now = Date.now();
  
  queryClient.getQueryCache().getAll().forEach(query => {
    const state = query.state;
    if (state.dataUpdatedAt && now - state.dataUpdatedAt > olderThan) {
      queryClient.removeQueries({ queryKey: query.queryKey });
    }
  });
}

import { useCallback, useSyncExternalStore } from "react";

export type AnalyticsPeriodPreset = "7d" | "30d" | "90d";

export type AnalyticsFilters = {
  preset: AnalyticsPeriodPreset;
  startDate: string;
  endDate: string;
  site: string;
};

const PRESET_DAYS: Record<AnalyticsPeriodPreset, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function rangeForPreset(
  preset: AnalyticsPeriodPreset,
  site = ""
): AnalyticsFilters {
  const end = new Date();
  const start = new Date(
    end.getTime() - PRESET_DAYS[preset] * 24 * 60 * 60 * 1000
  );
  return {
    preset,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    site,
  };
}

/** Shared store so layout filter bar and page queries stay in sync. */
let filtersState: AnalyticsFilters = rangeForPreset("30d");
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return filtersState;
}

function getServerSnapshot(): AnalyticsFilters {
  return rangeForPreset("30d");
}

/**
 * Analytics period filters — default rolling 30d → now.
 * Exposes ISO startDate/endDate plus preset setters for the filter bar.
 */
export function useAnalyticsFilters() {
  const filters = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const setPreset = useCallback((preset: AnalyticsPeriodPreset) => {
    filtersState = rangeForPreset(preset, filtersState.site);
    emit();
  }, []);

  const setPeriod = useCallback((startDate: string, endDate: string) => {
    filtersState = {
      preset: filtersState.preset,
      startDate,
      endDate,
      site: filtersState.site,
    };
    emit();
  }, []);

  const setSite = useCallback((site: string) => {
    filtersState = {
      ...filtersState,
      site,
    };
    emit();
  }, []);

  return {
    ...filters,
    setPreset,
    setPeriod,
    setSite,
  };
}

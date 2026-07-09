/**
 * Poll job sheet processing status and surface completion toasts (PR-11).
 * Watched IDs persist in sessionStorage so navigating away keeps polling.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  completionToastCopy,
  isActiveJobSheetStatus,
  isTerminalJobSheetStatus,
  type JobSheetProcessStatus,
} from "@shared/processingProgress";

const WATCH_KEY = "jsqa:processingWatch";
const POLL_MS = 1500;

export interface WatchedJobSheet {
  id: number;
  fileName?: string;
}

function readWatchList(): WatchedJobSheet[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(WATCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchedJobSheet[];
    return Array.isArray(parsed)
      ? parsed.filter(w => typeof w.id === "number")
      : [];
  } catch {
    return [];
  }
}

function writeWatchList(items: WatchedJobSheet[]): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(WATCH_KEY, JSON.stringify(items));
}

/** Register job sheets to poll until they reach a terminal status. */
export function watchJobSheetsProcessing(
  items: Array<number | WatchedJobSheet>
): void {
  const current = readWatchList();
  const byId = new Map(current.map(w => [w.id, w]));
  for (const item of items) {
    const entry =
      typeof item === "number"
        ? { id: item }
        : { id: item.id, fileName: item.fileName };
    byId.set(entry.id, { ...byId.get(entry.id), ...entry });
  }
  writeWatchList(Array.from(byId.values()));
  // Notify same-tab listeners
  window.dispatchEvent(new Event("jsqa:processing-watch"));
}

export function unwatchJobSheet(id: number): void {
  writeWatchList(readWatchList().filter(w => w.id !== id));
  window.dispatchEvent(new Event("jsqa:processing-watch"));
}

function notifyCompletion(
  status: JobSheetProcessStatus,
  fileName: string | undefined,
  jobSheetId: number
): void {
  const copy = completionToastCopy(status, fileName);
  const action =
    status === "failed"
      ? undefined
      : {
          label: "View",
          onClick: () => {
            window.location.href = `/audits?id=${jobSheetId}`;
          },
        };

  if (copy.type === "error") {
    toast.error(copy.title, { description: copy.description, action });
  } else if (copy.type === "warning") {
    toast.warning(copy.title, { description: copy.description, action });
  } else {
    toast.success(copy.title, { description: copy.description, action });
  }
}

/**
 * Mount once near the app shell. Polls watched job sheets until terminal.
 */
export function useProcessingWatchdog(): void {
  const utils = trpc.useUtils();
  const notifiedRef = useRef<Set<number>>(new Set());
  const watchVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const bump = () => {
      watchVersion.current += 1;
    };
    window.addEventListener("jsqa:processing-watch", bump);
    window.addEventListener("storage", bump);

    const tick = async () => {
      if (cancelled) return;
      const watched = readWatchList();
      if (watched.length === 0) {
        timer = setTimeout(tick, POLL_MS);
        return;
      }

      await Promise.all(
        watched.map(async item => {
          try {
            const status = await utils.jobSheets.processStatus.fetch({
              id: item.id,
            });
            if (!status) return;

            if (isTerminalJobSheetStatus(status.status)) {
              if (!notifiedRef.current.has(item.id)) {
                notifiedRef.current.add(item.id);
                notifyCompletion(status.status, item.fileName, item.id);
              }
              unwatchJobSheet(item.id);
              void utils.jobSheets.list.invalidate();
              void utils.stats.dashboard.invalidate();
              return;
            }

            if (!isActiveJobSheetStatus(status.status)) {
              unwatchJobSheet(item.id);
            }
          } catch {
            // Ignore transient poll errors; retry next tick
          }
        })
      );

      if (!cancelled) {
        timer = setTimeout(tick, POLL_MS);
      }
    };

    timer = setTimeout(tick, 400);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("jsqa:processing-watch", bump);
      window.removeEventListener("storage", bump);
    };
  }, [utils]);
}

/**
 * Poll a single job sheet's processStatus while it is active.
 */
export function useJobSheetProcessStatus(
  jobSheetId: number | null | undefined,
  opts?: { enabled?: boolean }
) {
  const id = jobSheetId ?? 0;
  const enabled = (opts?.enabled ?? true) && id > 0;

  return trpc.jobSheets.processStatus.useQuery(
    { id },
    {
      enabled,
      refetchInterval: query => {
        const status = query.state.data?.status;
        if (!status || isTerminalJobSheetStatus(status)) return false;
        if (isActiveJobSheetStatus(status)) return POLL_MS;
        return false;
      },
      staleTime: 500,
    }
  );
}

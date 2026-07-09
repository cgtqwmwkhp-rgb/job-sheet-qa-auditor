import { useEffect } from "react";

export interface ReviewQueueKeyboardHandlers {
  /** j — next item in filtered list */
  onNext: () => void;
  /** k — previous item in filtered list */
  onPrev: () => void;
  /** a — approve selected job sheet */
  onApprove: () => void;
  /** r — reject selected job sheet */
  onReject: () => void;
  /** ? — toggle shortcut legend */
  onToggleLegend?: () => void;
  /** Enter — focus review pane (optional) */
  onFocusPane?: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest('[role="dialog"]')) return true;
  return false;
}

/**
 * Hold-queue keyboard shortcuts (PR-13): j/k navigate, a approve, r reject.
 * Skips when focus is in an input, textarea, or dialog.
 */
export function useReviewQueueKeyboard(
  handlers: ReviewQueueKeyboardHandlers,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (key === "j") {
        e.preventDefault();
        handlers.onNext();
        return;
      }
      if (key === "k") {
        e.preventDefault();
        handlers.onPrev();
        return;
      }
      if (key === "a") {
        e.preventDefault();
        handlers.onApprove();
        return;
      }
      if (key === "r") {
        e.preventDefault();
        handlers.onReject();
        return;
      }
      if (key === "?" || (e.shiftKey && key === "/")) {
        e.preventDefault();
        handlers.onToggleLegend?.();
        return;
      }
      if (key === "Enter") {
        e.preventDefault();
        handlers.onFocusPane?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers, enabled]);
}

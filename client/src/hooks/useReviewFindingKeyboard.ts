import { useEffect } from "react";

export interface ReviewFindingKeyboardHandlers {
  /** n — next finding (prefer open issues) */
  onNextFinding: () => void;
  /** p — previous finding */
  onPrevFinding: () => void;
  /** o — override active finding */
  onOverrideFinding: () => void;
  /** c — correct active finding */
  onCorrectFinding: () => void;
  /** v — view active finding on PDF */
  onViewFinding: () => void;
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
 * Finding-level shortcuts for the review workstation (Phase 1.7):
 * n/p navigate findings, o override, c correct, v view on document.
 * Skips when focus is in an input, textarea, or dialog.
 */
export function useReviewFindingKeyboard(
  handlers: ReviewFindingKeyboardHandlers,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (key === "n") {
        e.preventDefault();
        handlers.onNextFinding();
        return;
      }
      if (key === "p") {
        e.preventDefault();
        handlers.onPrevFinding();
        return;
      }
      if (key === "o") {
        e.preventDefault();
        handlers.onOverrideFinding();
        return;
      }
      if (key === "c") {
        e.preventDefault();
        handlers.onCorrectFinding();
        return;
      }
      if (key === "v") {
        e.preventDefault();
        handlers.onViewFinding();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers, enabled]);
}

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

function isInsideReviewWorkstation(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("[data-review-workstation]"));
}

/**
 * Finding shortcuts stay live when focus is inside the workstation, or when
 * focus has fallen back to <body>/<html> after clicking a non-focusable finding
 * card (so o/n/p keep working without an extra Enter).
 * Skips when focus is clearly elsewhere (queue row, search, other chrome).
 */
function isFindingKeyboardContext(target: EventTarget | null): boolean {
  if (isInsideReviewWorkstation(target)) return true;
  if (!(target instanceof HTMLElement)) return false;
  if (target !== document.body && target !== document.documentElement) {
    return false;
  }
  return Boolean(document.querySelector("[data-review-workstation]"));
}

/**
 * Finding-level shortcuts for the review workstation (Phase 1.7):
 * n/p navigate findings, o override, c correct, v view on document.
 * Scoped so Hold Queue j/k/a/r still own queue navigation when focus is
 * on queue chrome; body fallback keeps the override path one keystroke.
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
      if (!isFindingKeyboardContext(e.target)) return;

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

/**
 * Accessibility Helpers
 *
 * Utilities for improving accessibility across the application.
 * Includes ARIA labels, keyboard navigation, and screen reader support.
 */

/** Landmark id targeted by the app-shell skip link */
export const MAIN_CONTENT_ID = "main-content";

/** Persistent polite live region mounted in the app shell */
export const A11Y_LIVE_REGION_ID = "a11y-status";

export const SKIP_TO_MAIN_LABEL = "Skip to main content";

/**
 * Generate descriptive ARIA label for action buttons
 */
export function getActionAriaLabel(
  action: string,
  itemType: string,
  itemName?: string
): string {
  if (itemName) {
    return `${action} ${itemType} ${itemName}`;
  }
  return `${action} ${itemType}`;
}

/**
 * Generate ARIA label for pagination buttons
 */
export function getPaginationAriaLabel(
  page: number,
  totalPages: number,
  type: "previous" | "next" | "page"
): string {
  if (type === "previous") {
    return page > 1 ? `Go to page ${page - 1}` : "Previous page (disabled)";
  }
  if (type === "next") {
    return page < totalPages
      ? `Go to page ${page + 1}`
      : "Next page (disabled)";
  }
  return `Go to page ${page}`;
}

/**
 * Generate ARIA label for sort buttons
 */
export function getSortAriaLabel(
  field: string,
  currentSort?: { field: string; direction: "asc" | "desc" }
): string {
  if (currentSort?.field === field) {
    const direction =
      currentSort.direction === "asc" ? "ascending" : "descending";
    return `Sorted by ${field} in ${direction} order. Click to reverse sort.`;
  }
  return `Sort by ${field}`;
}

/**
 * Generate ARIA label for filter buttons
 */
export function getFilterAriaLabel(
  filterName: string,
  isActive: boolean
): string {
  return isActive
    ? `${filterName} filter active. Click to remove.`
    : `Filter by ${filterName}`;
}

/**
 * Generate ARIA label for status badges
 */
export function getStatusAriaLabel(status: string, itemType: string): string {
  return `${itemType} status: ${status}`;
}

/**
 * Generate ARIA label for progress indicators
 */
export function getProgressAriaLabel(
  current: number,
  total: number,
  unit: string = "step"
): string {
  return `Progress: ${current} of ${total} ${unit}s completed`;
}

/**
 * Generate ARIA live region announcement for async operations
 */
export function getAsyncOperationAnnouncement(
  operation: string,
  status: "loading" | "success" | "error",
  details?: string
): string {
  if (status === "loading") {
    return `${operation} in progress...`;
  }
  if (status === "success") {
    return details
      ? `${operation} successful. ${details}`
      : `${operation} successful`;
  }
  return details ? `${operation} failed. ${details}` : `${operation} failed`;
}

/**
 * Generate ARIA label for toggle switches
 */
export function getToggleAriaLabel(label: string, isEnabled: boolean): string {
  return `${label}: ${isEnabled ? "enabled" : "disabled"}. Click to ${isEnabled ? "disable" : "enable"}.`;
}

/**
 * Generate ARIA label for expand/collapse buttons
 */
export function getExpandAriaLabel(label: string, isExpanded: boolean): string {
  return isExpanded ? `Collapse ${label}` : `Expand ${label}`;
}

/**
 * Generate ARIA label for tabs
 */
export function getTabAriaLabel(
  tabName: string,
  isSelected: boolean,
  index: number,
  total: number
): string {
  const position = `${index + 1} of ${total}`;
  return isSelected
    ? `${tabName} tab selected (${position})`
    : `${tabName} tab (${position})`;
}

/**
 * Generate ARIA label for modal dialogs
 */
export function getModalAriaLabel(
  title: string,
  type?: "dialog" | "alert" | "confirm"
): string {
  const typeLabel =
    type === "alert" ? "Alert" : type === "confirm" ? "Confirmation" : "Dialog";
  return `${typeLabel}: ${title}`;
}

/**
 * Keyboard navigation helper: trap focus within a container
 */
export function trapFocus(container: HTMLElement) {
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0] as HTMLElement;
  const lastElement = focusableElements[
    focusableElements.length - 1
  ] as HTMLElement;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }
  };

  container.addEventListener("keydown", handleKeyDown);

  // Return cleanup function
  return () => {
    container.removeEventListener("keydown", handleKeyDown);
  };
}

/**
 * Announce message to screen readers using the shell aria-live region
 * when present, otherwise a short-lived fallback region.
 */
export function announceToScreenReader(
  message: string,
  priority: "polite" | "assertive" = "polite"
) {
  const shellRegion = document.getElementById(A11Y_LIVE_REGION_ID);
  if (shellRegion) {
    shellRegion.setAttribute("aria-live", priority);
    // Clear then set so identical consecutive messages are announced
    shellRegion.textContent = "";
    window.requestAnimationFrame(() => {
      shellRegion.textContent = message;
    });
    return;
  }

  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("role", "status");
  liveRegion.setAttribute("aria-live", priority);
  liveRegion.setAttribute("aria-atomic", "true");
  liveRegion.className = "sr-only";
  liveRegion.textContent = message;

  document.body.appendChild(liveRegion);

  setTimeout(() => {
    liveRegion.remove();
  }, 1000);
}

/**
 * Generate skip link for keyboard navigation
 */
export function createSkipLink(
  targetId: string = MAIN_CONTENT_ID,
  label: string = SKIP_TO_MAIN_LABEL
): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = `#${targetId}`;
  link.textContent = label;
  link.className = "skip-link";
  return link;
}

/**
 * Check if element is keyboard accessible
 */
export function isKeyboardAccessible(element: HTMLElement): boolean {
  const tabIndex = element.getAttribute("tabindex");
  const tagName = element.tagName.toLowerCase();

  // Naturally focusable elements
  if (["a", "button", "input", "select", "textarea"].includes(tagName)) {
    return !element.hasAttribute("disabled");
  }

  // Elements with explicit tabindex >= 0
  return tabIndex !== null && parseInt(tabIndex) >= 0;
}

/**
 * Theme helpers — shared by ThemeProvider and contract tests.
 * Keeps light/dark class + storage contract stable without inventing a new palette.
 */

export const THEME_STORAGE_KEY = "theme";

export type Theme = "light" | "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function parseStoredTheme(
  value: string | null | undefined,
  fallback: Theme = "light"
): Theme {
  return isTheme(value) ? value : fallback;
}

/** Apply or remove the Tailwind `dark` class on a document root. */
export function applyThemeClass(
  root: Pick<Element, "classList">,
  theme: Theme
): void {
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function nextTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : "light";
}

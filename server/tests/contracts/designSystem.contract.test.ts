/**
 * Design system contract tests (PR-22)
 *
 * Verifies theme helpers, CSS token presence, and dark-class toggle contract.
 * Mocks only — no browser / live UI.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  THEME_STORAGE_KEY,
  applyThemeClass,
  isTheme,
  nextTheme,
  parseStoredTheme,
} from "../../../client/src/lib/theme";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const INDEX_CSS = path.join(ROOT, "client/src/index.css");
const INDEX_HTML = path.join(ROOT, "client/index.html");
const THEME_CONTEXT = path.join(ROOT, "client/src/contexts/ThemeContext.tsx");
const THEME_TOGGLE = path.join(ROOT, "client/src/components/ThemeToggle.tsx");
const DASHBOARD_LAYOUT = path.join(
  ROOT,
  "client/src/components/DashboardLayout.tsx"
);
const SONNER = path.join(ROOT, "client/src/components/ui/sonner.tsx");

describe("Design system — theme helpers", () => {
  it("accepts only light|dark themes", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it("parses stored theme with safe fallback", () => {
    expect(parseStoredTheme("dark")).toBe("dark");
    expect(parseStoredTheme("light")).toBe("light");
    expect(parseStoredTheme("nope")).toBe("light");
    expect(parseStoredTheme(null, "dark")).toBe("dark");
  });

  it("toggles light ↔ dark", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });

  it("applies and removes the dark class on a root element", () => {
    const classes = new Set<string>();
    const root = {
      classList: {
        add: (c: string) => {
          classes.add(c);
        },
        remove: (c: string) => {
          classes.delete(c);
        },
      },
    };

    applyThemeClass(root, "dark");
    expect(classes.has("dark")).toBe(true);

    applyThemeClass(root, "light");
    expect(classes.has("dark")).toBe(false);
  });

  it("uses a stable localStorage key", () => {
    expect(THEME_STORAGE_KEY).toBe("theme");
  });
});

describe("Design system — CSS tokens", () => {
  const css = fs.readFileSync(INDEX_CSS, "utf8");

  it("defines Plantexpand brand-lime tokens", () => {
    expect(css).toContain("--color-brand-lime");
    expect(css).toMatch(/--primary:\s*#beda41/i);
    expect(css).toMatch(/--ring:\s*#beda41/i);
  });

  it("defines light and dark theme blocks", () => {
    expect(css).toMatch(/:root\s*\{/);
    expect(css).toMatch(/\.dark\s*\{/);
    expect(css).toContain("--background:");
    expect(css).toContain("--foreground:");
    expect(css).toMatch(/--sidebar-primary:\s*#beda41/i);
  });

  it("exposes motion duration tokens", () => {
    expect(css).toContain("--duration-fast:");
    expect(css).toContain("--duration-normal:");
    expect(css).toContain("--ease-standard:");
  });

  it("includes skip-link and reduced-motion a11y rules", () => {
    expect(css).toContain(".skip-link");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(":focus-visible");
  });

  it("wires dark mode via class variant (not media-only)", () => {
    expect(css).toContain("@custom-variant dark");
    expect(css).toContain("color-scheme: dark");
  });
});

describe("Design system — chrome wiring", () => {
  it("ThemeProvider persists theme and toggles dark class", () => {
    const src = fs.readFileSync(THEME_CONTEXT, "utf8");
    expect(src).toContain("THEME_STORAGE_KEY");
    expect(src).toContain("applyThemeClass");
    expect(src).toContain("toggleTheme");
    expect(src).toContain("switchable");
  });

  it("ThemeToggle exposes aria-label and aria-pressed", () => {
    const src = fs.readFileSync(THEME_TOGGLE, "utf8");
    expect(src).toContain("aria-label");
    expect(src).toContain("aria-pressed");
    expect(src).toContain("Switch to light mode");
    expect(src).toContain("Switch to dark mode");
  });

  it("DashboardLayout includes skip link, theme toggle, command center, and main landmark", () => {
    const src = fs.readFileSync(DASHBOARD_LAYOUT, "utf8");
    expect(src).toContain('href="#main-content"');
    expect(src).toContain("skip-link");
    expect(src).toContain("ThemeToggle");
    expect(src).toContain("CommandCenter");
    expect(src).toContain('id="main-content"');
    expect(src).toContain('aria-label="Account menu"');
  });

  it("Sonner toaster uses app ThemeContext (not next-themes)", () => {
    const src = fs.readFileSync(SONNER, "utf8");
    expect(src).toContain("@/contexts/ThemeContext");
    expect(src).not.toContain("next-themes");
  });

  it("index.html theme-color matches brand lime (not indigo)", () => {
    const html = fs.readFileSync(INDEX_HTML, "utf8");
    expect(html).toContain('content="#BEDA41"');
    expect(html).not.toContain("#4F46E5");
  });
});

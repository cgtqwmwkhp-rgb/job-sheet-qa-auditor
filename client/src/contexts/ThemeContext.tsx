import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  THEME_STORAGE_KEY,
  type Theme,
  applyThemeClass,
  nextTheme,
  parseStoredTheme,
} from "@/lib/theme";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (switchable && typeof localStorage !== "undefined") {
      return parseStoredTheme(
        localStorage.getItem(THEME_STORAGE_KEY),
        defaultTheme
      );
    }
    return defaultTheme;
  });

  useEffect(() => {
    applyThemeClass(document.documentElement, theme);

    if (switchable) {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme, switchable]);

  const setTheme = useCallback(
    (next: Theme) => {
      if (!switchable) return;
      setThemeState(next);
    },
    [switchable]
  );

  const toggleTheme = switchable
    ? () => {
        setThemeState(prev => nextTheme(prev));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

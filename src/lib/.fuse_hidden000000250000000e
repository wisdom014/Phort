import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Theme state.
 *
 * `preference` is what the user chose — including 'auto', which defers to the
 * OS. `resolved` is the theme actually on screen, which is what UI needs when
 * it wants to show the current state rather than the setting.
 */
export type ThemePreference = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Flips between light and dark, leaving 'auto' behind. */
  toggle: () => void;
}

const STORAGE_KEY = 'lensflow.theme';

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'auto',
  resolved: 'dark',
  setPreference: () => {},
  toggle: () => {}
});

function prefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredPreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'auto';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => (prefersDark() ? 'dark' : 'light'));

  // Track the OS setting continuously — someone on 'auto' should follow their
  // system switching to night mode without reloading the app.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = preference === 'auto' ? systemTheme : preference;

  // The class on <html> is what the token layer in index.css keys off.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
  }, [resolved]);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or a full quota — the theme still applies for this
      // session, it just won't be remembered.
    }
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      setPreference,
      toggle: () => setPreference(resolved === 'dark' ? 'light' : 'dark')
    }),
    [preference, resolved]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

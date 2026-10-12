import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * User preferences that actually change how the app behaves.
 *
 * Everything here is deliberately something the app can honour on its own —
 * no settings for integrations that don't exist. Persisted to localStorage
 * because it's per-device presentation state, not catalog data.
 */

export type ExportFormat = 'zip' | 'csv';
export type GridDensity = 'comfortable' | 'compact';

export interface AppSettings {
  /**
   * Exposure score at or above which a clip counts as well lit. The analyzer
   * reports a raw 0-100 score; this is where the Good/Bad line sits, so moving
   * it re-sorts the Videos bucket immediately.
   */
  lightingThreshold: number;
  /** Show raw AI confidence percentages, or just flag what needs review. */
  showConfidence: boolean;
  /** How tightly the media grids pack. */
  density: GridDensity;
  /** Pre-selected format when the export dialog opens. */
  defaultExportFormat: ExportFormat;
  /** Include a catalog.csv inside exported ZIP archives. */
  includeCsvInZip: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  lightingThreshold: 60,
  showConfidence: false,
  density: 'comfortable',
  defaultExportFormat: 'zip',
  includeCsvInZip: true
};

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const STORAGE_KEY = 'lensflow.settings';

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
  resetSettings: () => {}
});

/**
 * Merges stored values over the defaults field by field, so a settings object
 * saved by an older build (missing keys the app has since added) still loads
 * instead of throwing the whole thing away.
 */
function readStoredSettings(): AppSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      lightingThreshold:
        typeof parsed.lightingThreshold === 'number'
          ? Math.min(100, Math.max(0, Math.round(parsed.lightingThreshold)))
          : DEFAULT_SETTINGS.lightingThreshold,
      showConfidence:
        typeof parsed.showConfidence === 'boolean' ? parsed.showConfidence : DEFAULT_SETTINGS.showConfidence,
      density: parsed.density === 'compact' ? 'compact' : DEFAULT_SETTINGS.density,
      defaultExportFormat: parsed.defaultExportFormat === 'csv' ? 'csv' : DEFAULT_SETTINGS.defaultExportFormat,
      includeCsvInZip:
        typeof parsed.includeCsvInZip === 'boolean' ? parsed.includeCsvInZip : DEFAULT_SETTINGS.includeCsvInZip
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(readStoredSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Not persistable in this browser context; settings still apply for the session.
    }
  }, [settings]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      updateSettings: (patch) => setSettings((prev) => ({ ...prev, ...patch })),
      resetSettings: () => setSettings(DEFAULT_SETTINGS)
    }),
    [settings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}

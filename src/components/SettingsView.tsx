import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Project, MediaAsset } from '../types';
import { useAuth } from '../lib/AuthContext';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { useSettings, ExportFormat, GridDensity } from '../lib/SettingsContext';
import { useTheme, ThemePreference } from '../lib/ThemeContext';
import { computeStorage, formatBytes } from '../lib/storage';
import { Thumb } from './Thumb';

interface SettingsViewProps {
  projects: Project[];
  assets: MediaAsset[];
  onDeleteProject: (projectId: string) => void;
  onOpenExport: () => void;
}

/**
 * Settings.
 *
 * Every control here does something real and persists on its own — theme and
 * grid density, the lighting threshold that re-sorts the Videos bucket, whether
 * AI confidence is shown, export defaults, plus real storage accounting and
 * project deletion. There are deliberately no toggles for integrations the app
 * doesn't have.
 */
export const SettingsView: React.FC<SettingsViewProps> = ({
  projects,
  assets,
  onDeleteProject,
  onOpenExport
}) => {
  const { user, signOut } = useAuth();
  const { settings, updateSettings, resetSettings } = useSettings();
  const { preference, resolved, setPreference } = useTheme();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const usage = useMemo(() => computeStorage(assets), [assets]);
  const projectPendingDelete = projects.find((p) => p.id === confirmDeleteId) || null;
  const pendingDeleteAssetCount = projectPendingDelete
    ? assets.filter((a) => a.projectId === projectPendingDelete.id).length
    : 0;

  const coverByProject = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    for (const a of assets) if (!map.has(a.projectId)) map.set(a.projectId, a);
    return map;
  }, [assets]);

  return (
    <div className="max-w-3xl space-y-6 pb-20">
      <div>
        <h1 className="font-['Geist'] text-2xl sm:text-3xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="text-ink-muted text-sm mt-1">
          Preferences are saved to this device and take effect right away.
        </p>
      </div>

      {/* Appearance */}
      <SettingCard icon="palette" tone="bg-accent-tint text-accent" title="Appearance"
        subtitle="Theme and how tightly grids pack.">
        <Row label="Theme" hint={preference === 'auto' ? `Following your system (${resolved})` : undefined}>
          <Segmented<ThemePreference>
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
          />
        </Row>
        <Row label="Grid density">
          <Segmented<GridDensity>
            value={settings.density}
            onChange={(density) => updateSettings({ density })}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' }
            ]}
          />
        </Row>
      </SettingCard>

      {/* Detection */}
      <SettingCard icon="tune" tone="bg-info/10 text-info" title="Detection & display"
        subtitle="How the on-device AI results are presented.">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="pr-3">
              <span className="block text-sm text-ink font-medium">Good-lighting threshold</span>
              <span className="text-[11px] text-ink-faint">
                Clips scoring at or above this land in “Good Lighting”. Moving it re-sorts the Videos bucket.
              </span>
            </div>
            <span className="text-sm font-mono-data text-ink tabular-nums shrink-0">
              {settings.lightingThreshold}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.lightingThreshold}
            onChange={(e) => updateSettings({ lightingThreshold: Number(e.target.value) })}
            className="w-full accent-[color:var(--accent)]"
          />
        </div>

        <Toggle
          label="Show AI confidence"
          hint="Display the raw match percentage on each asset instead of only flagging what needs review."
          checked={settings.showConfidence}
          onChange={(showConfidence) => updateSettings({ showConfidence })}
        />
      </SettingCard>

      {/* Export */}
      <SettingCard icon="ios_share" tone="bg-positive/10 text-positive" title="Export"
        subtitle="Defaults for the export dialog. Exports mirror your Smart Buckets.">
        <Row label="Default format">
          <Segmented<ExportFormat>
            value={settings.defaultExportFormat}
            onChange={(defaultExportFormat) => updateSettings({ defaultExportFormat })}
            options={[
              { value: 'zip', label: 'ZIP' },
              { value: 'csv', label: 'CSV' }
            ]}
          />
        </Row>
        <Toggle
          label="Include catalog.csv in ZIP"
          hint="Add a spreadsheet of the catalog alongside the media in ZIP exports."
          checked={settings.includeCsvInZip}
          onChange={(includeCsvInZip) => updateSettings({ includeCsvInZip })}
        />
        <button
          onClick={onOpenExport}
          disabled={assets.length === 0}
          className="w-full sm:w-auto px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-base">download</span>
          Export catalog{assets.length > 0 ? ` (${assets.length})` : ''}
        </button>
      </SettingCard>

      {/* Storage */}
      <SettingCard icon="database" tone="bg-accent-tint text-accent" title="Storage"
        subtitle="Real usage — the total size of everything you've added.">
        <div>
          <div className="w-full bg-surface-sunken h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                usage.percentUsed > 90 ? 'bg-critical' : usage.percentUsed > 70 ? 'bg-caution' : 'bg-accent'
              }`}
              style={{ width: `${usage.percentUsed}%` }}
            />
          </div>
          <div className="flex justify-between text-xs font-mono-data text-ink-faint mt-2">
            <span>
              {formatBytes(usage.usedBytes)} of {formatBytes(usage.quotaBytes)} · {usage.assetCount} item
              {usage.assetCount === 1 ? '' : 's'}
            </span>
            <span>{formatBytes(usage.remainingBytes)} free</span>
          </div>
        </div>
      </SettingCard>

      {/* Projects */}
      <SettingCard icon="folder" tone="bg-info/10 text-info" title="Projects"
        subtitle="Delete a project to remove it and its media from the catalog and storage.">
        {projects.length === 0 ? (
          <p className="text-sm text-ink-faint py-2">No projects yet. Add a shoot to get started.</p>
        ) : (
          <div className="divide-y divide-[color:var(--hairline)]">
            {projects.map((project) => {
              const cover = project.coverUrl || coverByProject.get(project.id)?.thumbnailUrl;
              const count = assets.filter((a) => a.projectId === project.id).length;
              return (
                <div key={project.id} className="flex items-center gap-3 py-3">
                  <Thumb
                    src={cover}
                    alt={project.title}
                    className="w-11 h-11 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink font-medium truncate">{project.title}</p>
                    <p className="text-[11px] font-mono-data text-ink-faint truncate">
                      {count} item{count === 1 ? '' : 's'} · {project.date}
                    </p>
                  </div>
                  <button
                    onClick={() => setConfirmDeleteId(project.id)}
                    className="shrink-0 p-2 rounded-lg text-ink-faint hover:text-critical hover:bg-critical/10 transition-colors"
                    title={`Delete ${project.title}`}
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </SettingCard>

      {/* Account */}
      {isSupabaseConfigured && user && (
        <SettingCard icon="account_circle" tone="bg-accent-tint text-accent" title="Account" subtitle={undefined}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-ink font-medium truncate">
                {user.user_metadata?.full_name || 'Signed in'}
              </p>
              <p className="text-xs text-ink-faint font-mono-data truncate">{user.email}</p>
            </div>
            <button
              onClick={signOut}
              className="shrink-0 px-4 py-2.5 bg-surface border border-hairline hover:bg-surface-hover rounded-xl text-sm text-ink transition-colors"
            >
              Sign out
            </button>
          </div>
        </SettingCard>
      )}

      <div className="flex justify-end">
        <button
          onClick={resetSettings}
          className="text-xs font-mono-data text-ink-faint hover:text-ink transition-colors"
        >
          Reset preferences to defaults
        </button>
      </div>

      {/* Delete confirmation */}
      <AnimatePresence>
        {projectPendingDelete && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setConfirmDeleteId(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-raised border border-hairline rounded-3xl w-full max-w-md p-6 shadow-panel space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-critical/10 rounded-xl text-critical">
                  <span className="material-symbols-outlined text-xl">delete_forever</span>
                </div>
                <h3 className="font-['Geist'] text-lg font-bold text-ink">Delete project?</h3>
              </div>
              <p className="text-sm text-ink-muted">
                <span className="text-ink font-semibold">{projectPendingDelete.title}</span> and its{' '}
                {pendingDeleteAssetCount} item{pendingDeleteAssetCount === 1 ? '' : 's'} will be permanently
                removed from your catalog and storage. This can't be undone.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2.5 bg-surface border border-hairline hover:bg-surface-hover rounded-xl text-sm text-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDeleteProject(projectPendingDelete.id);
                    setConfirmDeleteId(null);
                  }}
                  className="flex-1 py-2.5 bg-critical hover:opacity-90 text-white rounded-xl text-sm font-semibold transition-opacity"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------- Small building blocks ----------

const SettingCard: React.FC<{
  icon: string;
  tone: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ icon, tone, title, subtitle, children }) => (
  <section className="bg-surface-raised rounded-2xl p-5 sm:p-6 border border-hairline shadow-card space-y-4">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-xl shrink-0 ${tone}`}>
        <span className="material-symbols-outlined text-xl">{icon}</span>
      </div>
      <div>
        <h3 className="font-['Geist'] text-base font-bold text-ink">{title}</h3>
        {subtitle && <p className="text-xs text-ink-faint">{subtitle}</p>}
      </div>
    </div>
    <div className="space-y-4">{children}</div>
  </section>
);

const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
    <div>
      <span className="block text-sm text-ink font-medium">{label}</span>
      {hint && <span className="text-[11px] text-ink-faint">{hint}</span>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

function Segmented<T extends string>({
  value,
  onChange,
  options
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex bg-surface-sunken rounded-xl p-1 border border-hairline">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-accent text-white shadow-card'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const Toggle: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <label className="flex items-start justify-between gap-3 cursor-pointer">
    <div className="pr-2">
      <span className="block text-sm text-ink font-medium">{label}</span>
      {hint && <span className="text-[11px] text-ink-faint">{hint}</span>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`shrink-0 mt-0.5 w-10 h-6 rounded-full transition-colors relative ${
        checked ? 'bg-accent' : 'bg-surface-sunken border border-hairline'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-card transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  </label>
);

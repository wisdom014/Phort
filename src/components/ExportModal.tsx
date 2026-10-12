import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MediaAsset } from '../types';
import { useSettings } from '../lib/SettingsContext';
import { useNotifications } from '../lib/NotificationsContext';
import {
  buildExport,
  bucketPathFor,
  downloadBlob,
  ExportFormatChoice,
  ExportProgress
} from '../lib/exportService';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The assets to export — either the whole catalog or the current selection. */
  assets: MediaAsset[];
  /** Short description of what's being exported, e.g. "12 selected" or "whole catalog". */
  scopeLabel?: string;
}

/**
 * Export dialog.
 *
 * Packages the given assets exactly the way the Smart Buckets are organized on
 * screen — a ZIP whose folder tree mirrors the buckets (People / Objects &
 * Scenes / Videos → Good/Bad Lighting), or a single catalog CSV that carries
 * the same bucket path in a column. Defaults come from Settings and every run
 * posts a notification when it finishes.
 */
export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, assets, scopeLabel }) => {
  const { settings } = useSettings();
  const { notify } = useNotifications();

  const [format, setFormat] = useState<ExportFormatChoice>(settings.defaultExportFormat);
  const [includeCsv, setIncludeCsv] = useState(settings.includeCsvInZip);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-sync with the saved defaults each time the dialog opens.
  useEffect(() => {
    if (isOpen) {
      setFormat(settings.defaultExportFormat);
      setIncludeCsv(settings.includeCsvInZip);
      setRunning(false);
      setProgress(null);
      setError(null);
    }
  }, [isOpen, settings.defaultExportFormat, settings.includeCsvInZip]);

  // A quick preview of how many files land in each bucket folder, so the user
  // can see the export really is organized like the buckets before running it.
  const bucketBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) {
      const path = bucketPathFor(asset, settings.lightingThreshold);
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [assets, settings.lightingThreshold]);

  if (!isOpen) return null;

  const canExport = assets.length > 0 && !running;

  const runExport = async () => {
    if (assets.length === 0) return;
    setRunning(true);
    setError(null);
    setProgress({ done: 0, total: assets.length, label: 'Starting…', phase: 'fetching' });

    try {
      const result = await buildExport(
        assets,
        { format, includeCsvInZip: includeCsv, lightingThreshold: settings.lightingThreshold },
        (p) => setProgress(p)
      );
      downloadBlob(result.blob, result.filename);

      const detail =
        format === 'csv'
          ? `${result.rowCount} rows written to ${result.filename}`
          : `${result.fileCount} file${result.fileCount === 1 ? '' : 's'} packaged${
              result.missingCount > 0 ? ` · ${result.missingCount} skipped (source unavailable)` : ''
            }`;

      notify({ kind: 'success', title: 'Export ready', detail });
      setRunning(false);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed.';
      setError(message);
      notify({ kind: 'warning', title: 'Export failed', detail: message });
      setRunning(false);
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-raised border border-hairline rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 shadow-panel space-y-6"
      >
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-accent-tint rounded-xl text-accent">
              <span className="material-symbols-outlined text-xl">ios_share</span>
            </div>
            <div>
              <h3 className="font-['Geist'] text-lg font-bold text-ink">Export catalog</h3>
              <p className="text-xs text-ink-faint font-mono-data">
                {assets.length} item{assets.length === 1 ? '' : 's'}
                {scopeLabel ? ` · ${scopeLabel}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="text-ink-faint hover:text-ink disabled:opacity-40 p-1 rounded-lg"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {assets.length === 0 ? (
          <div className="border border-dashed border-hairline rounded-2xl py-10 text-center space-y-2">
            <span className="material-symbols-outlined text-3xl text-ink-faint">inbox</span>
            <p className="text-sm text-ink-muted">Nothing to export yet. Add some media first.</p>
          </div>
        ) : (
          <>
            {/* Format choice */}
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-wider text-ink-faint">Format</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFormat('zip')}
                  disabled={running}
                  className={`text-left p-3 rounded-2xl border transition-colors ${
                    format === 'zip'
                      ? 'border-accent bg-accent-tint'
                      : 'border-hairline bg-surface hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-center gap-2 text-ink">
                    <span className="material-symbols-outlined text-base text-accent">folder_zip</span>
                    <span className="text-sm font-semibold">ZIP archive</span>
                  </div>
                  <p className="text-[11px] text-ink-muted mt-1">
                    Media files in a folder tree that mirrors your Smart Buckets.
                  </p>
                </button>
                <button
                  onClick={() => setFormat('csv')}
                  disabled={running}
                  className={`text-left p-3 rounded-2xl border transition-colors ${
                    format === 'csv'
                      ? 'border-accent bg-accent-tint'
                      : 'border-hairline bg-surface hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-center gap-2 text-ink">
                    <span className="material-symbols-outlined text-base text-accent">table_view</span>
                    <span className="text-sm font-semibold">CSV catalog</span>
                  </div>
                  <p className="text-[11px] text-ink-muted mt-1">
                    One row per asset for a spreadsheet, with its bucket in a column.
                  </p>
                </button>
              </div>
            </div>

            {/* ZIP-only option */}
            {format === 'zip' && (
              <label className="flex items-center gap-3 p-3 rounded-2xl border border-hairline bg-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCsv}
                  onChange={(e) => setIncludeCsv(e.target.checked)}
                  disabled={running}
                  className="w-4 h-4 accent-[color:var(--accent)]"
                />
                <span className="text-sm text-ink">
                  Include a <span className="font-mono-data">catalog.csv</span> inside the archive
                </span>
              </label>
            )}

            {/* Bucket breakdown — proof the export matches the on-screen buckets */}
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-wider text-ink-faint">
                {format === 'zip' ? 'Folder layout' : 'Buckets covered'}
              </span>
              <div className="rounded-2xl border border-hairline bg-surface divide-y divide-[color:var(--hairline)]">
                {bucketBreakdown.map(([path, count]) => (
                  <div key={path} className="flex items-center justify-between px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-ink min-w-0">
                      <span className="material-symbols-outlined text-sm text-ink-faint shrink-0">
                        {format === 'zip' ? 'folder' : 'label'}
                      </span>
                      <span className="font-mono-data truncate">{path}</span>
                    </span>
                    <span className="text-xs text-ink-muted shrink-0 ml-2">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-[11px] font-mono-data text-critical bg-critical/10 border border-critical/30 rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            {/* Progress */}
            <AnimatePresence>
              {running && progress && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono-data text-ink-muted">
                    <span className="truncate">
                      {progress.phase === 'packaging' ? 'Packaging…' : progress.label}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="w-full bg-surface-sunken h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-accent to-info h-full rounded-full transition-all duration-200"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={onClose}
                disabled={running}
                className="flex-1 py-2.5 bg-surface border border-hairline hover:bg-surface-hover disabled:opacity-50 rounded-xl text-sm text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={runExport}
                disabled={!canExport}
                className="flex-1 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-base">
                  {running ? 'sync' : 'download'}
                </span>
                {running ? 'Exporting…' : format === 'zip' ? 'Export ZIP' : 'Export CSV'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

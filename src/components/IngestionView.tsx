import React, { useState } from 'react';
import { MediaAsset, PipelineSettingsState } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../lib/SettingsContext';
import { Thumb } from './Thumb';

interface IngestionViewProps {
  assets: MediaAsset[];
  /** Kept for API compatibility; routing rules run in the on-device analyzer. */
  pipelineSettings: PipelineSettingsState;
  onUpdateSettings: (settings: PipelineSettingsState) => void;
  onApproveAsset: (assetId: string) => void;
  onEditTags: (asset: MediaAsset) => void;
  onOpenUpload: () => void;
}

/**
 * Ingestion review queue.
 *
 * Every new file is classified on-device the moment it's added; high-confidence
 * results are auto-routed and the rest land here for a human to confirm or
 * adjust. All the numbers on this screen are real counts from the catalog.
 */
export const IngestionView: React.FC<IngestionViewProps> = ({
  assets,
  onApproveAsset,
  onEditTags,
  onOpenUpload
}) => {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<'review' | 'routed'>('review');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showConfidence = settings.showConfidence;
  const reviewAssets = assets.filter((a) => a.routeStatus === 'review_needed');
  const routedAssets = assets.filter((a) => a.routeStatus === 'auto_routed');
  const autoRouteRate = assets.length > 0 ? Math.round((routedAssets.length / assets.length) * 100) : 0;

  const displayList = activeTab === 'review' ? reviewAssets : routedAssets;

  const handleApprove = (id: string, fileName: string) => {
    onApproveAsset(id);
    setToastMessage(`Approved route for ${fileName}`);
    setTimeout(() => setToastMessage(null), 2000);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 right-4 sm:right-8 z-50 bg-surface-raised border border-positive/50 text-ink px-5 py-3 rounded-xl shadow-panel flex items-center gap-3 font-['Geist']"
          >
            <span className="material-symbols-outlined text-positive">check_circle</span>
            <span className="text-sm font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Geist'] text-2xl sm:text-3xl font-bold tracking-tight text-ink">Ingestion</h1>
          <p className="text-ink-muted text-xs mt-1 font-mono-data">
            Confirm or adjust how newly added media was auto-classified.
          </p>
        </div>

        <button
          onClick={onOpenUpload}
          className="self-start sm:self-auto px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-mono-data font-bold flex items-center gap-1.5 transition-colors"
        >
          <span className="material-symbols-outlined text-base">add_photo_alternate</span>
          <span>Ingest files</span>
        </button>
      </section>

      {/* Real processing summary */}
      <section className="bg-surface-raised rounded-2xl p-4 sm:p-6 border border-hairline shadow-card space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Total assets" value={assets.length} />
          <Stat label="Auto-routed" value={routedAssets.length} tone="text-positive" />
          <Stat label="Needs review" value={reviewAssets.length} tone={reviewAssets.length > 0 ? 'text-caution' : 'text-ink'} />
          <Stat label="Auto-route rate" value={`${autoRouteRate}%`} tone="text-accent" />
        </div>
        {assets.length > 0 && (
          <div>
            <div className="w-full bg-surface-sunken h-2 rounded-full overflow-hidden">
              <div
                className="bg-accent h-full rounded-full transition-all duration-500"
                style={{ width: `${autoRouteRate}%` }}
              />
            </div>
            <p className="text-[11px] font-mono-data text-ink-faint mt-2">
              {routedAssets.length} of {assets.length} routed automatically · {reviewAssets.length} awaiting review
            </p>
          </div>
        )}
      </section>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-hairline pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('review')}
          className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-mono-data transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'review' ? 'bg-accent text-white font-bold' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <span className="material-symbols-outlined text-sm">assignment_late</span>
          Needs review ({reviewAssets.length})
        </button>
        <button
          onClick={() => setActiveTab('routed')}
          className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-mono-data transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'routed' ? 'bg-accent text-white font-bold' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <span className="material-symbols-outlined text-sm">verified</span>
          Auto-routed ({routedAssets.length})
        </button>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {displayList.map((asset) => (
          <div
            key={asset.id}
            className="bg-surface-raised rounded-2xl p-4 sm:p-5 border border-hairline hover:border-accent/40 transition-colors flex flex-col sm:flex-row gap-4 sm:gap-5 shadow-card group"
          >
            {/* Thumbnail */}
            <div className="relative w-full sm:w-36 h-44 sm:h-36 rounded-xl overflow-hidden bg-surface shrink-0">
              <Thumb
                src={asset.thumbnailUrl}
                alt={asset.fileName}
                kind={asset.mediaKind}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {asset.mediaKind === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white">
                    <span className="material-symbols-outlined text-xl">play_arrow</span>
                  </span>
                </div>
              )}
              <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[9px] uppercase tracking-wider text-white">
                {asset.fileName.split('.').pop()?.toUpperCase() || 'RAW'}
              </div>
              {showConfidence && (
                <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-mono-data text-white">
                  {Math.round(asset.aiConfidenceScore * 100)}%
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 flex flex-col justify-between space-y-3 min-w-0">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-['Geist'] text-sm sm:text-base font-bold text-ink truncate">
                    {asset.fileName}
                  </h3>
                  <span className="text-[10px] sm:text-[11px] font-mono-data text-ink-faint shrink-0">
                    {asset.importedAt}
                  </span>
                </div>

                <div className="mt-2 space-y-1.5">
                  {asset.tier1Tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider text-ink-faint shrink-0">Detected:</span>
                      {asset.tier1Tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="bg-accent-tint text-accent border border-accent/30 text-[10px] font-mono-data px-2 py-0.5 rounded-md truncate max-w-[140px]"
                        >
                          {t.label}
                          {showConfidence ? ` (${t.confidence.toFixed(2)})` : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {asset.tier2Tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider text-ink-faint shrink-0">Details:</span>
                      {asset.tier2Tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="bg-info/15 text-info border border-info/30 text-[10px] font-mono-data px-2 py-0.5 rounded-md truncate max-w-[140px]"
                        >
                          {t.label}
                          {showConfidence ? ` (${t.confidence.toFixed(2)})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Route & actions */}
              <div className="pt-3 border-t border-hairline flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5 text-xs font-mono-data min-w-0">
                  <span className="text-ink-faint shrink-0">Route:</span>
                  <span className="text-positive font-semibold bg-positive/10 px-2 py-0.5 rounded border border-positive/20 truncate">
                    {asset.autoOrganizedBucket}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onEditTags(asset)}
                    className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-surface border border-hairline hover:bg-surface-hover text-xs font-mono-data text-ink rounded-lg transition-colors"
                  >
                    Edit tags
                  </button>

                  {asset.routeStatus === 'review_needed' ? (
                    <button
                      onClick={() => handleApprove(asset.id, asset.fileName)}
                      className="px-3 sm:px-4 py-1 sm:py-1.5 bg-positive hover:opacity-90 text-white text-xs font-mono-data font-bold rounded-lg transition-opacity flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">check</span>
                      Approve
                    </button>
                  ) : (
                    <span className="text-xs font-mono-data text-positive flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">verified</span>
                      Routed
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {displayList.length === 0 && (
          <div className="p-12 text-center bg-surface-raised rounded-2xl border border-hairline">
            <span className="material-symbols-outlined text-4xl text-ink-faint mb-2">
              {assets.length === 0 ? 'inbox' : 'task_alt'}
            </span>
            <h4 className="font-['Geist'] text-base font-semibold text-ink">
              {assets.length === 0
                ? 'Nothing ingested yet'
                : activeTab === 'review'
                ? 'All caught up'
                : 'Nothing auto-routed yet'}
            </h4>
            <p className="text-xs text-ink-faint mt-1 font-mono-data">
              {assets.length === 0
                ? 'Upload media to see it classified here.'
                : activeTab === 'review'
                ? 'No assets are awaiting manual review.'
                : 'Approved and high-confidence assets will appear here.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number | string; tone?: string }> = ({
  label,
  value,
  tone = 'text-ink'
}) => (
  <div>
    <div className={`font-['Geist'] text-xl sm:text-2xl font-bold font-mono-data ${tone}`}>{value}</div>
    <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-ink-faint mt-0.5">{label}</div>
  </div>
);

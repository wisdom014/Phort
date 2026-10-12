import React, { useState } from 'react';
import { MediaAsset } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../lib/SettingsContext';
import { Thumb } from './Thumb';

interface LibraryViewProps {
  assets: MediaAsset[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectAssetForInspector: (asset: MediaAsset) => void;
  onToggleAssetSelection: (assetId: string) => void;
  onSelectAllAssets: () => void;
  onDeselectAllAssets: () => void;
  onEditTags: (asset: MediaAsset) => void;
  onDeleteSelected: () => void;
  /** Opens the export dialog scoped to the given assets. */
  onOpenExport: (scopeAssets?: MediaAsset[], label?: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  assets,
  searchQuery,
  onSelectAssetForInspector,
  onToggleAssetSelection,
  onSelectAllAssets,
  onDeselectAllAssets,
  onEditTags,
  onDeleteSelected,
  onOpenExport
}) => {
  const { settings } = useSettings();
  const [filterType, setFilterType] = useState<'all' | 'photos' | 'videos' | 'selected'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'human' | 'nonhuman'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'newest' | 'confidence' | 'name'>('newest');

  const selectedCount = assets.filter((a) => a.isSelected).length;
  const showConfidence = settings.showConfidence;

  const filteredAssets = assets.filter((asset) => {
    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = asset.fileName.toLowerCase().includes(q);
      const matchProject = asset.projectName?.toLowerCase().includes(q);
      const matchBucket = asset.autoOrganizedBucket.toLowerCase().includes(q);
      const matchT1 = asset.tier1Tags.some((t) => t.label.toLowerCase().includes(q));
      const matchT2 = asset.tier2Tags.some((t) => t.label.toLowerCase().includes(q));
      const matchMood = asset.aiMoodAnalysis?.primaryMood.toLowerCase().includes(q);
      if (!matchName && !matchProject && !matchBucket && !matchT1 && !matchT2 && !matchMood) return false;
    }

    // Media type filter
    if (filterType === 'selected' && !asset.isSelected) return false;
    if (filterType === 'videos' && asset.mediaKind !== 'video') return false;
    if (filterType === 'photos' && asset.mediaKind === 'video') return false;

    // Category filter
    if (categoryFilter !== 'all' && asset.primaryCategory !== categoryFilter) return false;

    return true;
  }).sort((a, b) => {
    if (sortBy === 'confidence') return b.aiConfidenceScore - a.aiConfidenceScore;
    if (sortBy === 'name') return a.fileName.localeCompare(b.fileName);
    return new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime();
  });

  const hasFilter =
    !!searchQuery.trim() || filterType !== 'all' || categoryFilter !== 'all';

  // Grid packs tighter in compact mode — a real, visible effect of the setting.
  const gridClass =
    settings.density === 'compact'
      ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-2.5'
      : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4';

  return (
    <div className="space-y-6 pb-24">
      {/* Header & controls */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Geist'] text-2xl sm:text-3xl font-bold tracking-tight text-ink">
            Media library
          </h1>
          <p className="text-ink-muted text-xs mt-1 font-mono-data">
            {filteredAssets.length} of {assets.length} asset{assets.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={() =>
              onOpenExport(
                filteredAssets,
                hasFilter ? `${filteredAssets.length} shown` : undefined
              )
            }
            disabled={filteredAssets.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-surface-raised border border-hairline hover:bg-surface-hover disabled:opacity-50 text-xs font-medium text-ink transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-accent">ios_share</span>
            Export
          </button>

          <div className="flex items-center bg-surface-raised p-1 rounded-xl border border-hairline">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                viewMode === 'grid' ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
              }`}
              title="Grid view"
            >
              <span className="material-symbols-outlined text-base sm:text-lg">grid_view</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                viewMode === 'list' ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
              }`}
              title="List view"
            >
              <span className="material-symbols-outlined text-base sm:text-lg">format_list_bulleted</span>
            </button>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-surface-raised border border-hairline text-xs font-mono-data text-ink rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 focus:outline-none"
          >
            <option value="newest">Sort: Newest</option>
            <option value="confidence">Sort: Confidence</option>
            <option value="name">Sort: Filename</option>
          </select>
        </div>
      </section>

      {/* Filter bar */}
      <section className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 bg-surface-raised/60 p-2.5 sm:p-3.5 rounded-2xl border border-hairline">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => {
              setFilterType('all');
              setCategoryFilter('all');
            }}
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-mono-data transition-colors ${
              filterType === 'all' && categoryFilter === 'all'
                ? 'bg-accent text-white font-semibold'
                : 'bg-surface text-ink-muted hover:text-ink'
            }`}
          >
            All media ({assets.length})
          </button>
          <button
            onClick={() => setCategoryFilter(categoryFilter === 'human' ? 'all' : 'human')}
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-mono-data transition-colors flex items-center gap-1.5 ${
              categoryFilter === 'human'
                ? 'bg-accent-tint text-accent border border-accent/40 font-semibold'
                : 'bg-surface text-ink-muted hover:text-ink'
            }`}
          >
            <span className="material-symbols-outlined text-sm">face</span>
            People
          </button>
          <button
            onClick={() => setCategoryFilter(categoryFilter === 'nonhuman' ? 'all' : 'nonhuman')}
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-mono-data transition-colors flex items-center gap-1.5 ${
              categoryFilter === 'nonhuman'
                ? 'bg-accent-tint text-accent border border-accent/40 font-semibold'
                : 'bg-surface text-ink-muted hover:text-ink'
            }`}
          >
            <span className="material-symbols-outlined text-sm">category</span>
            Objects & scenes
          </button>
          <button
            onClick={() => setFilterType(filterType === 'videos' ? 'all' : 'videos')}
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-mono-data transition-colors flex items-center gap-1.5 ${
              filterType === 'videos'
                ? 'bg-accent-tint text-accent border border-accent/40 font-semibold'
                : 'bg-surface text-ink-muted hover:text-ink'
            }`}
          >
            <span className="material-symbols-outlined text-sm">movie</span>
            Videos
          </button>

          {selectedCount > 0 && (
            <button
              onClick={() => setFilterType('selected')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-mono-data transition-colors ${
                filterType === 'selected'
                  ? 'bg-positive text-white font-bold'
                  : 'bg-positive/15 text-positive border border-positive/40'
              }`}
            >
              Selected ({selectedCount})
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedCount > 0 ? (
            <button
              onClick={onDeselectAllAssets}
              className="text-xs font-mono-data text-ink-faint hover:text-ink underline"
            >
              Clear selection
            </button>
          ) : (
            <button
              onClick={onSelectAllAssets}
              disabled={filteredAssets.length === 0}
              className="text-xs font-mono-data text-accent hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Select all
            </button>
          )}
        </div>
      </section>

      {/* Empty state */}
      {filteredAssets.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-3xl py-16 text-center space-y-2">
          <span className="material-symbols-outlined text-4xl text-ink-faint">
            {assets.length === 0 ? 'photo_library' : 'search_off'}
          </span>
          <p className="text-sm text-ink-muted">
            {assets.length === 0
              ? 'Your library is empty. Upload media to get started.'
              : 'No assets match these filters.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className={gridClass}>
          {filteredAssets.map((asset) => {
            const isSelected = !!asset.isSelected;
            const ext = asset.fileName.split('.').pop()?.toUpperCase() || 'RAW';
            const primaryTag = asset.tier2Tags[0]?.label || asset.tier1Tags[0]?.label || 'indexed';

            return (
              <div
                key={asset.id}
                className={`group relative aspect-square rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 bg-surface ${
                  isSelected ? 'ring-2 ring-accent' : 'border border-hairline hover:border-accent/50'
                }`}
              >
                {/* Preview — Thumb falls back to an icon tile if the source is missing */}
                <Thumb
                  src={asset.thumbnailUrl}
                  alt={asset.fileName}
                  kind={asset.mediaKind}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />

                <div
                  onClick={() => onSelectAssetForInspector(asset)}
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30"
                />

                {/* Play badge for videos */}
                {asset.mediaKind === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white">
                      <span className="material-symbols-outlined text-2xl">play_arrow</span>
                    </span>
                  </div>
                )}

                {/* Top badges — over the dark image, so white text is correct */}
                <div className="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 flex items-center gap-1 sm:gap-1.5 pointer-events-none">
                  <span className="bg-black/70 backdrop-blur-md px-1.5 sm:px-2 py-0.5 rounded text-[8px] sm:text-[9px] uppercase tracking-wider text-white">
                    {ext}
                  </span>
                  {showConfidence && (
                    <span className="bg-positive/80 backdrop-blur-md px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-mono-data text-white">
                      {Math.round(asset.aiConfidenceScore * 100)}%
                    </span>
                  )}
                  {asset.routeStatus === 'review_needed' && (
                    <span className="bg-caution/85 backdrop-blur-md px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-mono-data text-white">
                      review
                    </span>
                  )}
                </div>

                {/* Selection checkbox */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleAssetSelection(asset.id);
                  }}
                  className={`absolute top-2 right-2 sm:top-2.5 sm:right-2.5 w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-accent text-white shadow-md'
                      : 'bg-black/50 border border-white/40 text-transparent hover:text-white/70'
                  }`}
                  aria-label={isSelected ? 'Deselect' : 'Select'}
                >
                  <span className="material-symbols-outlined text-xs sm:text-sm font-bold">check</span>
                </button>

                {/* Bottom info */}
                <div
                  onClick={() => onSelectAssetForInspector(asset)}
                  className="absolute bottom-2 inset-x-2 sm:bottom-2.5 sm:inset-x-2.5 flex flex-col justify-end text-xs font-mono-data"
                >
                  <div className="truncate text-white font-medium text-[10px] sm:text-[11px]">
                    {asset.fileName}
                  </div>
                  <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-white/70 mt-0.5">
                    <span className="truncate max-w-[80px]">#{primaryTag.toLowerCase()}</span>
                    <span className="shrink-0">{asset.importedAt}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List view */
        <div className="bg-surface-raised rounded-2xl border border-hairline overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono-data min-w-[620px]">
              <thead className="bg-surface text-ink-faint border-b border-hairline uppercase tracking-wider text-[10px] sm:text-xs">
                <tr>
                  <th className="p-3 sm:p-4 w-10 sm:w-12 text-center">Select</th>
                  <th className="p-3 sm:p-4">File</th>
                  <th className="p-3 sm:p-4">Project</th>
                  <th className="p-3 sm:p-4">Taxonomy</th>
                  <th className="p-3 sm:p-4">Smart bucket</th>
                  {showConfidence && <th className="p-3 sm:p-4">Confidence</th>}
                  <th className="p-3 sm:p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--hairline)]">
                {filteredAssets.map((asset) => (
                  <tr
                    key={asset.id}
                    className={`hover:bg-surface-hover/50 transition-colors ${
                      asset.isSelected ? 'bg-accent-tint' : ''
                    }`}
                  >
                    <td className="p-3 sm:p-4 text-center">
                      <input
                        type="checkbox"
                        checked={!!asset.isSelected}
                        onChange={() => onToggleAssetSelection(asset.id)}
                        className="w-4 h-4 rounded accent-[color:var(--accent)]"
                      />
                    </td>
                    <td className="p-3 sm:p-4">
                      <div className="flex items-center gap-3">
                        <Thumb
                          src={asset.thumbnailUrl}
                          alt={asset.fileName}
                          kind={asset.mediaKind}
                          className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover shrink-0 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <div
                            onClick={() => onSelectAssetForInspector(asset)}
                            className="text-ink font-medium hover:text-accent cursor-pointer truncate max-w-[140px] sm:max-w-[200px]"
                          >
                            {asset.fileName}
                          </div>
                          <div className="text-[10px] text-ink-faint">{asset.importedAt}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 sm:p-4 text-ink-muted truncate max-w-[120px]">
                      {asset.projectName || 'General'}
                    </td>
                    <td className="p-3 sm:p-4">
                      <span className="bg-accent-tint text-accent px-2 py-0.5 rounded text-[10px]">
                        {asset.tier1Tags[0]?.label || asset.primaryCategory}
                      </span>
                    </td>
                    <td className="p-3 sm:p-4 text-ink-muted truncate max-w-[120px]">
                      {asset.autoOrganizedBucket}
                    </td>
                    {showConfidence && (
                      <td className="p-3 sm:p-4">
                        <span className="text-positive font-bold">
                          {Math.round(asset.aiConfidenceScore * 100)}%
                        </span>
                      </td>
                    )}
                    <td className="p-3 sm:p-4 text-right">
                      <button
                        onClick={() => onEditTags(asset)}
                        className="p-1 text-ink-faint hover:text-accent transition-colors"
                        title="Edit details"
                      >
                        <span className="material-symbols-outlined text-base">edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Floating multi-select action bar */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-surface-raised/95 backdrop-blur-xl border border-accent/50 rounded-2xl px-3 sm:px-6 py-2.5 sm:py-3.5 shadow-panel flex items-center gap-2 sm:gap-6 max-w-[calc(100vw-1.5rem)]"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-accent text-white flex items-center justify-center text-[10px] sm:text-xs font-bold font-mono-data">
                {selectedCount}
              </span>
              <span className="text-xs font-mono-data text-ink font-medium hidden sm:inline">Selected</span>
            </div>

            <div className="h-5 sm:h-6 w-px bg-hairline shrink-0" />

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 overflow-x-auto">
              <button
                onClick={() => {
                  const selected = assets.filter((a) => a.isSelected);
                  onOpenExport(selected, `${selected.length} selected`);
                }}
                className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-mono-data font-semibold transition-colors flex items-center gap-1 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-sm">ios_share</span>
                <span>Export</span>
              </button>

              <button
                onClick={() => {
                  const targetAsset = assets.find((a) => a.isSelected);
                  if (targetAsset) onEditTags(targetAsset);
                }}
                className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-surface border border-hairline hover:bg-surface-hover text-xs font-mono-data text-ink rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-sm">label</span>
                <span>Tags</span>
              </button>

              <button
                onClick={onDeleteSelected}
                className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-critical/10 border border-critical/30 hover:bg-critical/20 text-xs font-mono-data text-critical rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                <span>Remove</span>
              </button>

              <button
                onClick={onDeselectAllAssets}
                className="p-1 text-ink-faint hover:text-ink transition-colors"
                title="Deselect"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

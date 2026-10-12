import React, { useState } from 'react';
import { MediaAsset, BucketCategory, HumanFilter, LightingVerdict } from '../types';
import { useSettings } from '../lib/SettingsContext';
import { Thumb } from './Thumb';

interface BucketsViewProps {
  category: BucketCategory;
  onCategoryChange: (cat: BucketCategory) => void;
  assets: MediaAsset[];
  selectedAsset: MediaAsset | null;
  onSelectAsset: (asset: MediaAsset | null) => void;
  onEditTags: (asset: MediaAsset) => void;
}

type VideoFilter = 'all' | LightingVerdict;
type LightTone = 'positive' | 'caution';

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const BucketsView: React.FC<BucketsViewProps> = ({
  category,
  onCategoryChange,
  assets,
  selectedAsset,
  onSelectAsset,
  onEditTags
}) => {
  const { settings } = useSettings();
  const showConfidence = settings.showConfidence;

  const [humanFilter, setHumanFilter] = useState<HumanFilter>('all');
  const [videoFilter, setVideoFilter] = useState<VideoFilter>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortBy, setSortBy] = useState<'confidence' | 'newest' | 'joy' | 'lighting'>('newest');

  // Videos live only in the Videos bucket — the subject buckets are stills-only,
  // so a clip never shows up in two places.
  const categoryAssets = assets.filter((asset) => {
    if (category === 'videos') return asset.mediaKind === 'video';
    if (asset.mediaKind === 'video') return false;
    if (category === 'humans') return asset.primaryCategory === 'human';
    return asset.primaryCategory === 'nonhuman';
  });

  // Apply sub-filters
  const filteredAssets = categoryAssets.filter((asset) => {
    if (category === 'humans') {
      if (humanFilter === 'solo' && asset.aiHumanDetails?.groupType !== 'solo') return false;
      if (humanFilter === 'couples' && asset.aiHumanDetails?.groupType !== 'duo') return false;
      if (humanFilter === 'groups' && asset.aiHumanDetails?.groupType !== 'small_group' && asset.aiHumanDetails?.groupType !== 'crowd') return false;
      if (humanFilter === 'mood' && !asset.aiMoodAnalysis) return false;
    }
    if (category === 'videos' && videoFilter !== 'all') {
      if ((asset.lightingQuality?.verdict ?? 'good') !== videoFilter) return false;
    }
    if (selectedTag) {
      const hasT1 = asset.tier1Tags.some((t) => t.label.toLowerCase() === selectedTag.toLowerCase());
      const hasT2 = asset.tier2Tags.some((t) => t.label.toLowerCase() === selectedTag.toLowerCase());
      if (!hasT1 && !hasT2) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'lighting') return (b.lightingQuality?.score ?? 0) - (a.lightingQuality?.score ?? 0);
    if (sortBy === 'confidence') return b.aiConfidenceScore - a.aiConfidenceScore;
    if (sortBy === 'joy') return (b.aiMoodAnalysis?.joyScore || 0) - (a.aiMoodAnalysis?.joyScore || 0);
    return new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime();
  });

  // Videos are presented as two lighting groups rather than one flat grid.
  const goodLightingVideos = filteredAssets.filter((a) => (a.lightingQuality?.verdict ?? 'good') === 'good');
  const badLightingVideos = filteredAssets.filter((a) => a.lightingQuality?.verdict === 'bad');

  // Counts for the filter chips — from the full bucket, not the filtered view,
  // so the numbers don't shift as you click between them.
  const videoGoodCount = categoryAssets.filter((a) => (a.lightingQuality?.verdict ?? 'good') === 'good').length;
  const videoBadCount = categoryAssets.filter((a) => a.lightingQuality?.verdict === 'bad').length;

  const activeAsset = selectedAsset && filteredAssets.some((a) => a.id === selectedAsset.id)
    ? selectedAsset
    : (filteredAssets.length > 0 ? filteredAssets[0] : null);

  const getCategoryTitle = () => {
    if (category === 'humans') return 'People';
    if (category === 'videos') return 'Videos';
    return 'Objects & scenes';
  };

  const getCategorySubtitle = () => {
    if (category === 'videos') return 'Clips grouped by measured lighting quality — brightness, contrast and clipping across the whole clip';
    if (category === 'nonhuman') return 'Objects, gear, details, landscapes and venues — everything without a person in frame';
    return 'Portraits and group shots, sorted by who is in the frame';
  };

  const tabButtonClass = (tab: BucketCategory) =>
    `px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-mono-data flex items-center gap-1.5 transition-all whitespace-nowrap ${
      category === tab
        ? 'bg-accent text-white font-bold shadow-card'
        : 'text-ink-muted hover:text-ink'
    }`;

  const chipClass = (active: boolean) =>
    `px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-mono-data transition-colors ${
      active
        ? 'bg-accent-tint text-accent border border-accent/40 font-semibold'
        : 'bg-surface text-ink-muted hover:text-ink'
    }`;

  /** One tile in the gallery grid. Videos get a lighting badge + play affordance. */
  const renderTile = (asset: MediaAsset) => {
    const isSelected = activeAsset?.id === asset.id;
    const primaryTag = asset.tier2Tags[0]?.label || asset.tier1Tags[0]?.label || 'asset';
    const isVideo = asset.mediaKind === 'video';
    const lighting = asset.lightingQuality;

    return (
      <div
        key={asset.id}
        onClick={() => onSelectAsset(asset)}
        className={`relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 group bg-surface-sunken ${
          isSelected
            ? 'ring-2 ring-accent shadow-card'
            : 'border border-hairline hover:border-accent/40'
        }`}
      >
        {/* Poster/thumbnail — videos store a JPG poster in thumbnailUrl, so this is
            always an <img> with a graceful fallback (never a broken <video>). */}
        <Thumb
          src={asset.thumbnailUrl}
          alt={asset.fileName}
          kind={asset.mediaKind}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-75 group-hover:opacity-90 transition-opacity pointer-events-none"></div>

        {/* Top badges — sit over a dark scrim, so white text is intentional here. */}
        <div className="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 flex items-center gap-1.5 flex-wrap max-w-[calc(100%-1rem)]">
          {isVideo && lighting ? (
            <span className="bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono-data text-white border border-hairline flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${lighting.verdict === 'good' ? 'bg-positive' : 'bg-caution'}`} />
              {lighting.verdict === 'good' ? 'GOOD' : 'LOW'} LIGHT {lighting.score}
            </span>
          ) : (
            <span className="bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono-data text-white border border-hairline truncate max-w-[90px]">
              #{primaryTag.toLowerCase()}
            </span>
          )}
          {!isVideo && showConfidence && (
            <span className="bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono-data text-white flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-positive" />
              {Math.round(asset.aiConfidenceScore * 100)}%
            </span>
          )}
        </div>

        {/* Play affordance for video tiles */}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/20 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-xl">play_arrow</span>
            </div>
          </div>
        )}

        {isSelected && (
          <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-accent flex items-center justify-center text-white shadow-card">
            <span className="material-symbols-outlined text-xs sm:text-sm font-bold">check</span>
          </div>
        )}

        {/* Bottom info — over the dark scrim, so white text is intentional. */}
        <div className="absolute bottom-2 inset-x-2 sm:bottom-2.5 sm:inset-x-2.5 flex items-center justify-between text-[11px] font-mono-data text-white/90 pointer-events-none">
          <span className="truncate max-w-[110px] sm:max-w-[140px] font-semibold">{asset.fileName}</span>
          <span className="text-[10px] text-white/60 shrink-0">
            {isVideo ? formatDuration(asset.durationSeconds) : asset.importedAt}
          </span>
        </div>
      </div>
    );
  };

  /** A titled group of video tiles (Good Lighting / Bad Lighting). */
  const renderVideoGroup = (
    title: string,
    subtitle: string,
    icon: string,
    tone: LightTone,
    groupAssets: MediaAsset[]
  ) => {
    const toneWrap = tone === 'positive' ? 'bg-positive/15 text-positive' : 'bg-caution/15 text-caution';
    const toneChip =
      tone === 'positive'
        ? 'bg-positive/15 text-positive border-positive/30'
        : 'bg-caution/15 text-caution border-caution/30';

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${toneWrap}`}>
            <span className="material-symbols-outlined text-base">{icon}</span>
          </div>
          <h3 className="font-['Geist'] text-sm sm:text-base font-bold text-ink">{title}</h3>
          <span className={`text-[10px] font-mono-data px-2 py-0.5 rounded-full border ${toneChip}`}>
            {groupAssets.length}
          </span>
          <span className="text-[11px] text-ink-faint font-mono-data">{subtitle}</span>
        </div>

        {groupAssets.length === 0 ? (
          <div className="border border-dashed border-hairline rounded-2xl py-8 text-center text-xs font-mono-data text-ink-faint">
            No clips in this group.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {groupAssets.map(renderTile)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Category Tabs & Header */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <h1 className="font-['Geist'] text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              {getCategoryTitle()}
            </h1>
            <span className="bg-accent-tint text-accent border border-accent/30 text-[11px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {filteredAssets.length} {category === 'videos' ? 'Clips' : 'Assets'}
            </span>
          </div>
          <p className="text-ink-muted text-xs mt-1 font-mono-data max-w-xl">
            {getCategorySubtitle()}
          </p>
        </div>

        {/* Category Switcher Tabs */}
        <div className="flex items-center bg-surface-raised p-1 rounded-xl border border-hairline self-start sm:self-auto overflow-x-auto max-w-full">
          <button onClick={() => onCategoryChange('humans')} className={tabButtonClass('humans')}>
            <span className="material-symbols-outlined text-sm">face</span>
            People
          </button>
          <button onClick={() => onCategoryChange('nonhuman')} className={tabButtonClass('nonhuman')}>
            <span className="material-symbols-outlined text-sm">category</span>
            Objects
          </button>
          <button onClick={() => onCategoryChange('videos')} className={tabButtonClass('videos')}>
            <span className="material-symbols-outlined text-sm">movie</span>
            Videos
          </button>
        </div>
      </section>

      {/* Sub-Filters and Quick Tags Bar */}
      <section className="flex flex-wrap items-center justify-between gap-2.5 bg-surface-raised/60 p-2.5 sm:p-3 rounded-2xl border border-hairline">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {category === 'humans' && (
            <>
              <button
                onClick={() => { setHumanFilter('all'); setSelectedTag(null); }}
                className={chipClass(humanFilter === 'all' && !selectedTag)}
              >
                All
              </button>
              <button onClick={() => setHumanFilter('solo')} className={chipClass(humanFilter === 'solo')}>
                #solo
              </button>
              <button onClick={() => setHumanFilter('couples')} className={chipClass(humanFilter === 'couples')}>
                #couples
              </button>
              <button onClick={() => setHumanFilter('groups')} className={chipClass(humanFilter === 'groups')}>
                #groups
              </button>
              <button onClick={() => setHumanFilter('mood')} className={chipClass(humanFilter === 'mood')}>
                #mood
              </button>
            </>
          )}

          {category === 'nonhuman' && (
            <>
              <button onClick={() => setSelectedTag(null)} className={chipClass(!selectedTag)}>
                All objects
              </button>
              <button onClick={() => setSelectedTag('indoor')} className={chipClass(selectedTag === 'indoor')}>
                #indoor
              </button>
              <button onClick={() => setSelectedTag('outdoor')} className={chipClass(selectedTag === 'outdoor')}>
                #outdoor
              </button>
              <button onClick={() => setSelectedTag('landscape')} className={chipClass(selectedTag === 'landscape')}>
                #landscape
              </button>
              <button onClick={() => setSelectedTag('urban')} className={chipClass(selectedTag === 'urban')}>
                #urban
              </button>
              <button onClick={() => setSelectedTag('studio')} className={chipClass(selectedTag === 'studio')}>
                #studio
              </button>
            </>
          )}

          {category === 'videos' && (
            <>
              <button
                onClick={() => { setVideoFilter('all'); setSelectedTag(null); }}
                className={chipClass(videoFilter === 'all' && !selectedTag)}
              >
                All clips ({categoryAssets.length})
              </button>
              <button onClick={() => setVideoFilter('good')} className={chipClass(videoFilter === 'good')}>
                Good lighting ({videoGoodCount})
              </button>
              <button onClick={() => setVideoFilter('bad')} className={chipClass(videoFilter === 'bad')}>
                Low lighting ({videoBadCount})
              </button>
            </>
          )}
        </div>

        {/* Sort Dropdown Trigger */}
        <div className="relative">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="flex items-center gap-2 bg-surface border border-hairline hover:bg-surface-hover px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono-data text-ink transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-accent">tune</span>
            <span>Sort: {sortBy}</span>
          </button>

          {showFilterMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-surface-raised border border-hairline rounded-xl shadow-panel p-2 z-50">
              <div className="text-[10px] text-ink-faint px-3 py-1 uppercase tracking-wider">Sort assets by</div>
              <button
                onClick={() => { setSortBy('newest'); setShowFilterMenu(false); }}
                className={`w-full text-left px-3 py-2 text-xs font-mono-data rounded-lg transition-colors ${sortBy === 'newest' ? 'bg-accent-tint text-accent' : 'text-ink-muted hover:bg-surface'}`}
              >
                Newest first
              </button>
              {category === 'videos' && (
                <button
                  onClick={() => { setSortBy('lighting'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-xs font-mono-data rounded-lg transition-colors ${sortBy === 'lighting' ? 'bg-accent-tint text-accent' : 'text-ink-muted hover:bg-surface'}`}
                >
                  Lighting score
                </button>
              )}
              <button
                onClick={() => { setSortBy('joy'); setShowFilterMenu(false); }}
                className={`w-full text-left px-3 py-2 text-xs font-mono-data rounded-lg transition-colors ${sortBy === 'joy' ? 'bg-accent-tint text-accent' : 'text-ink-muted hover:bg-surface'}`}
              >
                Emotion score
              </button>
              {showConfidence && (
                <button
                  onClick={() => { setSortBy('confidence'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-xs font-mono-data rounded-lg transition-colors ${sortBy === 'confidence' ? 'bg-accent-tint text-accent' : 'text-ink-muted hover:bg-surface'}`}
                >
                  Detection confidence
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Main Layout: Responsive Grid Gallery + Asset Inspector Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-2 space-y-6">
          {filteredAssets.length === 0 && (
            <div className="border border-dashed border-hairline rounded-2xl py-16 text-center space-y-2">
              <span className="material-symbols-outlined text-3xl text-ink-faint">
                {category === 'videos' ? 'movie' : 'photo_library'}
              </span>
              <p className="text-sm font-mono-data text-ink-muted">
                {category === 'videos' ? 'No video clips ingested yet.' : 'Nothing in this bucket yet.'}
              </p>
            </div>
          )}

          {/* Videos are split into lighting groups; other buckets use one flat grid. */}
          {category === 'videos' && filteredAssets.length > 0 ? (
            <>
              {(videoFilter === 'all' || videoFilter === 'good') &&
                renderVideoGroup(
                  'Good lighting',
                  'Well-exposed, usable footage',
                  'wb_sunny',
                  'positive',
                  goodLightingVideos
                )}
              {(videoFilter === 'all' || videoFilter === 'bad') &&
                renderVideoGroup(
                  'Low lighting',
                  'Under/overexposed, flat, or clipping',
                  'brightness_low',
                  'caution',
                  badLightingVideos
                )}
            </>
          ) : (
            filteredAssets.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                {filteredAssets.map(renderTile)}
              </div>
            )
          )}
        </div>

        {/* Desktop Sticky Inspector Sidebar & Mobile Card */}
        {activeAsset && (
          <aside className="lg:col-span-1 bg-surface-raised rounded-2xl border border-hairline p-4 sm:p-6 space-y-5 sm:space-y-6 shadow-panel lg:sticky lg:top-24">
            {/* Asset Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-['Geist'] text-base sm:text-lg font-bold text-ink truncate">
                  {activeAsset.fileName}
                </h3>
                <div className="flex items-center gap-2 text-xs font-mono-data text-ink-faint mt-0.5">
                  <span className="truncate">Imported {activeAsset.importedAt}</span>
                  <span>•</span>
                  <span className="text-accent uppercase shrink-0">
                    {activeAsset.mimeType.split('/')[1] || activeAsset.mediaKind}
                  </span>
                </div>
              </div>

              {showConfidence && (
                <span className="bg-positive/15 text-positive border border-positive/30 text-[10px] font-mono-data px-2.5 py-1 rounded-full uppercase shrink-0">
                  {Math.round(activeAsset.aiConfidenceScore * 100)}%
                </span>
              )}
            </div>

            {/* Interactive Preview — real media, with a face-box HUD on stills. */}
            <div className="relative aspect-[4/3] max-h-64 sm:max-h-72 rounded-xl overflow-hidden bg-surface-sunken border border-hairline group">
              {activeAsset.mediaKind === 'video' ? (
                <video
                  className="w-full h-full object-cover"
                  src={activeAsset.originalUrl}
                  poster={activeAsset.thumbnailUrl || undefined}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <Thumb
                  src={activeAsset.originalUrl}
                  alt={activeAsset.fileName}
                  kind={activeAsset.mediaKind}
                  className="w-full h-full object-cover"
                />
              )}

              {/* Detected faces — bounding-box HUD overlay (stills only) */}
              {activeAsset.mediaKind !== 'video' && activeAsset.aiHumanDetails?.faces?.map((face) => (
                <div
                  key={face.id}
                  style={{
                    top: `${face.box[0]}%`,
                    left: `${face.box[1]}%`,
                    width: `${face.box[2]}%`,
                    height: `${face.box[3]}%`
                  }}
                  className="absolute border-2 border-positive rounded-md pointer-events-none"
                >
                  <span className="absolute -top-5 left-0 bg-positive text-white font-mono-data text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                    {face.label}
                  </span>
                </div>
              ))}

              {activeAsset.mediaKind === 'video' && activeAsset.durationSeconds ? (
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono-data text-white pointer-events-none">
                  {formatDuration(activeAsset.durationSeconds)}
                </div>
              ) : null}
            </div>

            {/* Lighting Analysis — the signal the Videos bucket sorts on */}
            {activeAsset.lightingQuality && (
              <div className="space-y-3 bg-surface/60 p-3.5 sm:p-4 rounded-xl border border-hairline">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-ink-faint uppercase tracking-wider">
                    Lighting analysis
                  </span>
                  <span
                    className={`text-[10px] font-mono-data px-2 py-0.5 rounded-full border uppercase ${
                      activeAsset.lightingQuality.verdict === 'good'
                        ? 'bg-positive/15 text-positive border-positive/30'
                        : 'bg-caution/15 text-caution border-caution/30'
                    }`}
                  >
                    {activeAsset.lightingQuality.verdict === 'good' ? 'Good lighting' : 'Low lighting'}
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono-data mb-1">
                    <span className="text-ink">Lighting score</span>
                    <span className={activeAsset.lightingQuality.verdict === 'good' ? 'text-positive' : 'text-caution'}>
                      {activeAsset.lightingQuality.score}/100
                    </span>
                  </div>
                  <div className="w-full bg-surface-sunken h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${activeAsset.lightingQuality.score}%`,
                        background: activeAsset.lightingQuality.verdict === 'good'
                          ? 'linear-gradient(to right, var(--accent), var(--positive))'
                          : 'linear-gradient(to right, var(--caution), var(--critical))'
                      }}
                    ></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono-data pt-2 border-t border-hairline">
                  <div>
                    <span className="text-ink-faint text-[10px] block">Brightness</span>
                    <span className="text-ink font-medium">{activeAsset.lightingQuality.brightness} / 255</span>
                  </div>
                  <div>
                    <span className="text-ink-faint text-[10px] block">Contrast</span>
                    <span className="text-ink font-medium">{activeAsset.lightingQuality.contrast}</span>
                  </div>
                  <div>
                    <span className="text-ink-faint text-[10px] block">Shadow clip</span>
                    <span className="text-ink font-medium">
                      {Math.round(activeAsset.lightingQuality.shadowClipping * 100)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-faint text-[10px] block">Highlight clip</span>
                    <span className="text-ink font-medium">
                      {Math.round(activeAsset.lightingQuality.highlightClipping * 100)}%
                    </span>
                  </div>
                  {activeAsset.mediaKind === 'video' && (
                    <>
                      <div>
                        <span className="text-ink-faint text-[10px] block">Exposure drift</span>
                        <span className="text-ink font-medium">{activeAsset.lightingQuality.exposureVariance}</span>
                      </div>
                      <div>
                        <span className="text-ink-faint text-[10px] block">Frames sampled</span>
                        <span className="text-ink font-medium">{activeAsset.lightingQuality.framesSampled}</span>
                      </div>
                    </>
                  )}
                </div>

                {activeAsset.lightingQuality.reasons.length > 0 && (
                  <div className="pt-2 border-t border-hairline flex flex-wrap gap-1.5">
                    {activeAsset.lightingQuality.reasons.map((reason) => (
                      <span
                        key={reason}
                        className="text-[10px] font-mono-data px-2 py-0.5 rounded-full bg-surface-sunken border border-hairline text-ink-muted"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Detected signals */}
            <div className="space-y-3 bg-surface/60 p-3.5 sm:p-4 rounded-xl border border-hairline">
              <span className="text-[10px] text-ink-faint uppercase tracking-wider">
                Detected signals
              </span>

              {activeAsset.aiMoodAnalysis && (
                <div>
                  <div className="flex justify-between text-xs font-mono-data mb-1">
                    <span className="text-ink">Mood: {activeAsset.aiMoodAnalysis.primaryMood}</span>
                    <span className="text-positive">{activeAsset.aiMoodAnalysis.joyScore}% joy</span>
                  </div>
                  <div className="w-full bg-surface-sunken h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-accent to-positive h-full rounded-full"
                      style={{ width: `${activeAsset.aiMoodAnalysis.joyScore}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs font-mono-data pt-2 border-t border-hairline">
                <div>
                  <span className="text-ink-faint text-[10px] block">Subjects</span>
                  <span className="text-ink font-medium truncate block">
                    {activeAsset.aiHumanDetails?.peopleCount
                      ? `${activeAsset.aiHumanDetails.peopleCount} (${activeAsset.aiHumanDetails.groupType})`
                      : 'None detected'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-faint text-[10px] block">Media</span>
                  <span className="text-ink font-medium capitalize truncate block">
                    {activeAsset.mediaKind === 'video'
                      ? `Video • ${formatDuration(activeAsset.durationSeconds)}`
                      : 'Still image'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-faint text-[10px] block">Scene</span>
                  <span className="text-ink font-medium capitalize truncate block">
                    {activeAsset.aiObjectDetails?.environment
                      || activeAsset.aiHumanDetails?.shotType?.replace('_', ' ')
                      || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-faint text-[10px] block">Smart bucket</span>
                  <span className="text-accent font-medium truncate block">
                    {activeAsset.autoOrganizedBucket}
                  </span>
                </div>
              </div>
            </div>

            {/* Project & File Readout */}
            <div className="space-y-2 bg-surface/60 p-3.5 sm:p-4 rounded-xl border border-hairline text-xs font-mono-data">
              <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1.5">
                File metadata
              </div>
              <div className="flex justify-between py-1 border-b border-hairline">
                <span className="text-ink-faint">Project:</span>
                <span className="text-ink truncate ml-2">{activeAsset.projectName || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-hairline">
                <span className="text-ink-faint">Size:</span>
                <span className="text-ink truncate ml-2">
                  {activeAsset.fileSizeBytes > 0
                    ? `${(activeAsset.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-hairline">
                <span className="text-ink-faint">Aspect:</span>
                <span className="text-ink capitalize">{activeAsset.aspectRatio}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-ink-faint">Route:</span>
                <span className="text-ink">{activeAsset.routeStatus.replace('_', ' ')}</span>
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={() => onEditTags(activeAsset)}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-mono-data font-bold transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-base">edit_note</span>
              Edit details
            </button>
          </aside>
        )}
      </div>
    </div>
  );
};

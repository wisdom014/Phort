import React, { useMemo, useState } from 'react';
import { Project, MediaAsset, LiveIngestionEvent, BucketCategory, NavigationTab } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Thumb } from './Thumb';
import { computeStorage, formatBytes } from '../lib/storage';

interface WorkspaceViewProps {
  projects: Project[];
  assets: MediaAsset[];
  liveEvents: LiveIngestionEvent[];
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onNavigateTab: (tab: NavigationTab) => void;
  onSelectBucket: (category: BucketCategory) => void;
  onOpenUpload: () => void;
  onOpenNewProject: () => void;
  onOpenExport: () => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  projects,
  assets,
  liveEvents,
  onSelectProject,
  onDeleteProject,
  onNavigateTab,
  onSelectBucket,
  onOpenUpload,
  onOpenNewProject,
  onOpenExport
}) => {
  // Which project (if any) is pending a delete confirmation.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Stills only in the subject buckets — clips are counted in the Videos bucket.
  const stills = assets.filter((a) => a.mediaKind !== 'video');
  const videos = assets.filter((a) => a.mediaKind === 'video');

  const humanAssets = stills.filter((a) => a.primaryCategory === 'human');
  const nonHumanAssets = stills.filter((a) => a.primaryCategory === 'nonhuman');
  const goodLightingCount = videos.filter((a) => (a.lightingQuality?.verdict ?? 'good') === 'good').length;
  const badLightingCount = videos.filter((a) => a.lightingQuality?.verdict === 'bad').length;

  const usage = useMemo(() => computeStorage(assets), [assets]);

  // First real thumbnail per project, used as a cover when none was set.
  const coverByProject = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    for (const a of assets) {
      if (!map.has(a.projectId)) map.set(a.projectId, a);
    }
    return map;
  }, [assets]);

  const reviewCount = assets.filter((a) => a.routeStatus === 'review_needed').length;
  const hasAnything = assets.length > 0 || projects.length > 0;
  const projectPendingDelete = projects.find((p) => p.id === confirmDeleteId) || null;
  const pendingDeleteAssetCount = projectPendingDelete
    ? assets.filter((a) => a.projectId === projectPendingDelete.id).length
    : 0;

  const stats = [
    { label: 'Assets', value: assets.length, icon: 'perm_media', tone: 'text-accent bg-accent-tint' },
    { label: 'Photos', value: stills.length, icon: 'image', tone: 'text-info bg-info/10' },
    { label: 'Videos', value: videos.length, icon: 'movie', tone: 'text-positive bg-positive/10' },
    { label: 'To review', value: reviewCount, icon: 'rule', tone: 'text-caution bg-caution/10' }
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Geist'] text-2xl sm:text-3xl font-bold tracking-tight text-ink">
            Workspace
          </h1>
          <p className="text-ink-muted text-sm mt-1">
            Your shoots and the buckets your media is organized into.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onOpenExport}
            disabled={assets.length === 0}
            className="flex items-center gap-2 bg-surface-raised border border-hairline hover:bg-surface-hover disabled:opacity-50 px-4 py-2.5 rounded-xl text-sm text-ink transition-colors"
          >
            <span className="material-symbols-outlined text-base text-accent">ios_share</span>
            <span>Export</span>
          </button>
          <button
            onClick={onOpenNewProject}
            className="flex items-center gap-2 bg-surface-raised border border-hairline hover:bg-surface-hover px-4 py-2.5 rounded-xl text-sm text-ink transition-colors"
          >
            <span className="material-symbols-outlined text-base text-accent">create_new_folder</span>
            <span>New shoot</span>
          </button>
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors shadow-card"
          >
            <span className="material-symbols-outlined text-base">add_photo_alternate</span>
            <span>Add media</span>
          </button>
        </div>
      </section>

      {/* Real stat strip — all zero until media is actually added */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-surface-raised rounded-2xl p-4 sm:p-5 border border-hairline shadow-card"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-ink-faint">{s.label}</span>
              <div className={`p-1.5 rounded-lg ${s.tone}`}>
                <span className="material-symbols-outlined text-base">{s.icon}</span>
              </div>
            </div>
            <div className="font-['Geist'] text-2xl sm:text-3xl font-bold text-ink tracking-tight mt-3 font-mono-data">
              {s.value.toLocaleString()}
            </div>
          </div>
        ))}
      </section>

      {/* Storage — real used vs. plan quota */}
      <section className="bg-surface-raised rounded-2xl p-5 sm:p-6 border border-hairline shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-lg">database</span>
            <h3 className="font-['Geist'] text-sm sm:text-base font-bold text-ink">Storage</h3>
          </div>
          <span className="text-xs font-mono-data text-ink-muted">
            {formatBytes(usage.remainingBytes)} free
          </span>
        </div>
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
            {formatBytes(usage.usedBytes)} of {formatBytes(usage.quotaBytes)} used
          </span>
          <span>{usage.percentUsed.toFixed(usage.percentUsed < 10 ? 1 : 0)}%</span>
        </div>
      </section>

      {/* Recent Projects */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-['Geist'] text-lg sm:text-xl font-bold text-ink">Projects</h2>
            <p className="text-xs text-ink-faint">Each folder you add becomes its own project.</p>
          </div>
          {projects.length > 0 && (
            <button
              onClick={() => onNavigateTab('library')}
              className="text-xs font-mono-data text-accent hover:underline"
            >
              View library →
            </button>
          )}
        </div>

        {projects.length === 0 ? (
          <button
            onClick={onOpenNewProject}
            className="w-full border border-dashed border-hairline rounded-2xl py-12 flex flex-col items-center justify-center gap-3 hover:border-accent/50 hover:bg-surface-hover transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-accent-tint text-accent flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">create_new_folder</span>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-ink">Create your first shoot</p>
              <p className="text-xs text-ink-faint mt-0.5">
                Drop a folder of photos and videos — they'll be sorted automatically.
              </p>
            </div>
          </button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {projects.map((project) => {
              const cover = project.coverUrl || coverByProject.get(project.id)?.thumbnailUrl;
              return (
                <div
                  key={project.id}
                  className="bg-surface-raised rounded-2xl overflow-hidden border border-hairline hover:border-accent/50 transition-all duration-300 group shadow-card flex flex-col"
                >
                  <div
                    onClick={() => onSelectProject(project.id)}
                    className="relative aspect-[16/10] max-h-48 overflow-hidden bg-surface-sunken cursor-pointer"
                  >
                    <Thumb
                      src={cover}
                      alt={project.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Delete — appears on hover, opens a confirm dialog (never window.confirm) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(project.id);
                      }}
                      title="Delete project"
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity bg-black/60 hover:bg-critical text-white backdrop-blur-md p-1.5 rounded-lg"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>

                    <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-mono-data text-white flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">image</span>
                        {project.assetCount}
                      </span>
                      {project.videoCount > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">videocam</span>
                          {project.videoCount}
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    onClick={() => onSelectProject(project.id)}
                    className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3 cursor-pointer"
                  >
                    <div>
                      <h3 className="font-['Geist'] text-sm sm:text-base font-semibold text-ink group-hover:text-accent transition-colors line-clamp-1">
                        {project.title}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-ink-faint mt-1">
                        <span className="truncate">{project.location}</span>
                        <span>•</span>
                        <span className="font-mono-data shrink-0">{project.date}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-hairline flex items-center justify-between">
                      <span className="text-[11px] font-mono-data text-ink-muted truncate">
                        {project.client || 'Private client'}
                      </span>
                      <span className="material-symbols-outlined text-sm text-ink-faint group-hover:translate-x-1 transition-transform group-hover:text-accent shrink-0">
                        arrow_forward
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Smart Buckets */}
      <section className="space-y-4">
        <div>
          <h2 className="font-['Geist'] text-lg sm:text-xl font-bold text-ink">Smart Buckets</h2>
          <p className="text-xs text-ink-faint">Media is sorted into these automatically as it's added.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <BucketCard
            title="People"
            icon="face"
            iconTone="bg-accent-tint text-accent"
            count={humanAssets.length}
            unit="photos"
            previews={humanAssets.slice(0, 3)}
            onOpen={() => {
              onSelectBucket('humans');
              onNavigateTab('buckets');
            }}
          />

          <BucketCard
            title="Objects & Scenes"
            icon="category"
            iconTone="bg-info/10 text-info"
            count={nonHumanAssets.length}
            unit="photos"
            previews={nonHumanAssets.slice(0, 3)}
            onOpen={() => {
              onSelectBucket('nonhuman');
              onNavigateTab('buckets');
            }}
          />

          {/* Videos sort on measured lighting, so this card shows the split rather than a montage */}
          <div
            onClick={() => {
              onSelectBucket('videos');
              onNavigateTab('buckets');
            }}
            className="bg-surface-raised rounded-2xl p-4 sm:p-5 border border-hairline hover:border-accent/50 transition-all cursor-pointer group shadow-card flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-positive/10 flex items-center justify-center text-positive">
                    <span className="material-symbols-outlined text-lg">movie</span>
                  </div>
                  <div>
                    <h3 className="font-['Geist'] text-sm sm:text-base font-bold text-ink group-hover:text-accent transition-colors">
                      Videos
                    </h3>
                    <p className="text-[11px] font-mono-data text-ink-faint">{videos.length} clips</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-sm text-ink-faint group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </div>

              <div className="aspect-[16/9] max-h-40 rounded-xl bg-surface-sunken border border-hairline p-3 sm:p-4 flex flex-col justify-center gap-3">
                <LightingBar
                  label="Good lighting"
                  icon="wb_sunny"
                  tone="text-positive"
                  bar="bg-positive"
                  value={goodLightingCount}
                  total={videos.length}
                />
                <LightingBar
                  label="Bad lighting"
                  icon="brightness_low"
                  tone="text-caution"
                  bar="bg-caution"
                  value={badLightingCount}
                  total={videos.length}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent activity — only shown once real events exist this session */}
      {liveEvents.length > 0 && (
        <section className="bg-surface-raised rounded-2xl p-5 sm:p-6 border border-hairline shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-['Geist'] text-sm sm:text-base font-bold text-ink">Recent activity</h3>
            <button
              onClick={() => onNavigateTab('ingestion')}
              className="text-xs font-mono-data text-accent hover:underline"
            >
              Open pipeline →
            </button>
          </div>
          <div className="space-y-2.5">
            {liveEvents.slice(0, 5).map((ev) => (
              <div
                key={ev.id}
                className="bg-surface p-3 rounded-xl border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 text-xs font-mono-data"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-ink-faint text-[10px] sm:text-[11px] shrink-0">{ev.timestamp}</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        ev.type === 'subject'
                          ? 'bg-accent'
                          : ev.type === 'object'
                            ? 'bg-info'
                            : ev.type === 'warning'
                              ? 'bg-caution'
                              : 'bg-positive'
                      }`}
                    />
                    <span className="text-ink font-medium truncate">{ev.message}</span>
                  </div>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <span className="text-ink-muted text-[11px]">{ev.target}</span>
                  {ev.subtext && <span className="text-ink-faint text-[10px] ml-1.5">({ev.subtext})</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* First-run hint when the whole catalog is empty */}
      {!hasAnything && (
        <p className="text-center text-xs text-ink-faint">
          Everything starts at zero. Counts, storage, and buckets fill in as you add real media.
        </p>
      )}

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

/** A subject bucket card with a small live montage of real thumbnails. */
const BucketCard: React.FC<{
  title: string;
  icon: string;
  iconTone: string;
  count: number;
  unit: string;
  previews: MediaAsset[];
  onOpen: () => void;
}> = ({ title, icon, iconTone, count, unit, previews, onOpen }) => (
  <div
    onClick={onOpen}
    className="bg-surface-raised rounded-2xl p-4 sm:p-5 border border-hairline hover:border-accent/50 transition-all cursor-pointer group shadow-card flex flex-col justify-between"
  >
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconTone}`}>
            <span className="material-symbols-outlined text-lg">{icon}</span>
          </div>
          <div>
            <h3 className="font-['Geist'] text-sm sm:text-base font-bold text-ink group-hover:text-accent transition-colors">
              {title}
            </h3>
            <p className="text-[11px] font-mono-data text-ink-faint">
              {count} {unit}
            </p>
          </div>
        </div>
        <span className="material-symbols-outlined text-sm text-ink-faint group-hover:translate-x-1 transition-transform">
          arrow_forward
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 aspect-[16/9] max-h-40 rounded-xl overflow-hidden">
        {previews.length > 0
          ? previews.map((a, i) => (
              <Thumb
                key={a.id}
                src={a.thumbnailUrl}
                alt={a.fileName}
                kind={a.mediaKind}
                className={`w-full h-full object-cover ${
                  i === 0 && previews.length < 3 ? 'col-span-3' : ''
                }`}
              />
            ))
          : Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="w-full h-full bg-surface-sunken flex items-center justify-center text-ink-faint"
              >
                <span className="material-symbols-outlined text-lg">{icon}</span>
              </div>
            ))}
      </div>
    </div>
  </div>
);

/** A single Good/Bad lighting proportion bar for the Videos card. */
const LightingBar: React.FC<{
  label: string;
  icon: string;
  tone: string;
  bar: string;
  value: number;
  total: number;
}> = ({ label, icon, tone, bar, value, total }) => (
  <div>
    <div className="flex justify-between text-[11px] font-mono-data mb-1">
      <span className={`flex items-center gap-1.5 ${tone}`}>
        <span className="material-symbols-outlined text-[13px]">{icon}</span>
        {label}
      </span>
      <span className="text-ink">{value}</span>
    </div>
    <div className="w-full bg-surface-raised h-1.5 rounded-full overflow-hidden">
      <div
        className={`${bar} h-full rounded-full transition-all`}
        style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }}
      />
    </div>
  </div>
);

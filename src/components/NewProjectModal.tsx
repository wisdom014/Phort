import React, { useRef, useState } from 'react';
import { MediaAsset, Project } from '../types';
import { motion } from 'motion/react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { projectRowToProject, projectToRow } from '../lib/mappers';
import { uuid } from '../lib/id';
import { useAuth } from '../lib/AuthContext';
import {
  FolderBatch,
  ingestFile,
  readFolderBatchesFromDrop,
  readFolderBatchesFromFileList
} from '../lib/ingestionService';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (project: Project) => void;
  /** Called once per folder, with the assets that folder produced. */
  onIngestComplete?: (assets: MediaAsset[]) => void;
}

const DEFAULT_COVER = '';

/**
 * A folder queued for ingestion. `title` starts as the folder name but stays
 * editable right up until processing begins.
 */
interface QueuedFolder extends FolderBatch {
  /** Stable key — relativePath can repeat across separate drops. */
  key: string;
  title: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  processed: number;
  currentFile?: string;
  error?: string;
}

let folderKeySeq = 0;

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
  onIngestComplete
}) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [client, setClient] = useState('');
  const [location, setLocation] = useState('');
  const [coverUrl] = useState(DEFAULT_COVER);

  const [folders, setFolders] = useState<QueuedFolder[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingDrop, setIsReadingDrop] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const totalFiles = folders.reduce((sum, f) => sum + f.files.length, 0);
  const totalProcessed = folders.reduce((sum, f) => sum + f.processed, 0);

  const addBatches = (batches: FolderBatch[]) => {
    if (batches.length === 0) return;
    setFolders((prev) => [
      ...prev,
      ...batches.map((b) => ({
        ...b,
        key: `folder-${folderKeySeq++}`,
        title: b.folderName,
        status: 'queued' as const,
        processed: 0
      }))
    ]);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;
    setIsReadingDrop(true);
    try {
      addBatches(await readFolderBatchesFromDrop(e.dataTransfer));
    } finally {
      setIsReadingDrop(false);
    }
  };

  const handleFolderPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addBatches(readFolderBatchesFromFileList(e.target.files));
    // Reset so picking the same folder again still fires a change event.
    e.target.value = '';
  };

  const updateFolder = (key: string, patch: Partial<QueuedFolder>) => {
    setFolders((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  const removeFolder = (key: string) => {
    setFolders((prev) => prev.filter((f) => f.key !== key));
  };

  /** Creates the project row (or a local-only project when Supabase is off). */
  const createProject = async (projectTitle: string, videoCount: number, assetCount: number): Promise<Project> => {
    const project: Project = {
      id: uuid(),
      title: projectTitle,
      client: client || 'Private Client',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      location: location || 'Studio / Location',
      coverUrl,
      assetCount,
      videoCount,
      status: 'processing',
      syncProgress: 0,
      faces: []
    };

    if (isSupabaseConfigured && user) {
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...projectToRow(project), user_id: user.id })
        .select()
        .single();
      if (!error && data) return projectRowToProject(data);
    }

    return project;
  };

  /**
   * Processes each queued folder into its own project, one folder at a time.
   *
   * Every file carries the folder's project id through ingestion, so assets from
   * different folders can never end up in the same project — that isolation is
   * the whole point of the per-folder queue.
   */
  const handleProcessFolders = async () => {
    if (folders.length === 0 || isProcessing) return;
    setIsProcessing(true);

    for (const folder of folders) {
      if (folder.status === 'done') continue;

      updateFolder(folder.key, { status: 'processing', processed: 0, error: undefined });

      try {
        // eslint-disable-next-line no-await-in-loop
        const project = await createProject(
          folder.title.trim() || folder.folderName,
          folder.videoCount,
          folder.imageCount
        );
        onCreateProject(project);

        const produced: MediaAsset[] = [];
        for (let i = 0; i < folder.files.length; i += 1) {
          const file = folder.files[i];
          updateFolder(folder.key, { processed: i, currentFile: file.name });
          // Sequential so the AI vision models aren't run concurrently.
          // eslint-disable-next-line no-await-in-loop
          const asset = await ingestFile(file, {
            projectId: project.id,
            projectName: project.title,
            userId: user?.id
          });
          produced.push(asset);
        }

        updateFolder(folder.key, {
          status: 'done',
          processed: folder.files.length,
          currentFile: undefined
        });
        onIngestComplete?.(produced);
      } catch (err) {
        updateFolder(folder.key, {
          status: 'error',
          currentFile: undefined,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    setIsProcessing(false);
  };

  /** Manual path: create an empty project with no ingestion. */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (folders.length > 0) {
      await handleProcessFolders();
      return;
    }
    if (!title.trim()) return;

    setIsSaving(true);
    const project = await createProject(title.trim(), 0, 0);
    setIsSaving(false);
    onCreateProject(project);
    onClose();
  };

  const allDone = folders.length > 0 && folders.every((f) => f.status === 'done');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-raised border border-hairline rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-panel space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-accent/20 rounded-xl text-accent">
              <span className="material-symbols-outlined text-xl">folder_special</span>
            </div>
            <div>
              <h3 className="font-['Geist'] text-base sm:text-lg font-bold text-ink">New Shoot</h3>
              <p className="text-xs text-ink-faint font-mono-data">
                Drop folders — each becomes its own project
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-ink-faint hover:text-ink disabled:opacity-40 p-1 rounded-lg"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Folder Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!isProcessing) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-2xl border-2 border-dashed p-5 sm:p-6 text-center transition-all ${
            isDragging
              ? 'border-accent bg-accent/10'
              : 'border-hairline bg-surface/60 hover:border-accent/50'
          }`}
        >
          <span className="material-symbols-outlined text-3xl text-accent">
            {isReadingDrop ? 'hourglass_top' : 'drive_folder_upload'}
          </span>
          <p className="font-['Geist'] text-sm font-semibold text-ink mt-2">
            {isReadingDrop ? 'Reading folders...' : 'Drag folders here'}
          </p>
          <p className="text-[11px] font-mono-data text-ink-faint mt-1">
            Photos and videos in each folder stay together, in that folder's project
          </p>

          <input
            ref={folderInputRef}
            type="file"
            multiple
            // Non-standard but the only way to pick a whole directory tree.
            {...({ webkitdirectory: '', directory: '' } as any)}
            onChange={handleFolderPick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            disabled={isProcessing}
            className="mt-3 px-3.5 py-2 rounded-xl bg-surface-raised border border-hairline hover:bg-surface-hover disabled:opacity-50 text-xs font-mono-data text-ink transition-colors inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm text-accent">folder_open</span>
            Choose folder
          </button>
        </div>

        {/* Queued Folders — titles are editable until processing starts */}
        {folders.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-ink-faint uppercase tracking-wider">
                {folders.length} {folders.length === 1 ? 'Folder' : 'Folders'} → {folders.length === 1 ? 'Project' : 'Projects'}
              </span>
              <span className="text-[10px] font-mono-data text-accent">
                {totalProcessed}/{totalFiles} files
              </span>
            </div>

            {folders.map((folder) => (
              <div
                key={folder.key}
                className="bg-surface/60 border border-hairline rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-base shrink-0 ${
                      folder.status === 'done'
                        ? 'text-positive'
                        : folder.status === 'error'
                          ? 'text-critical'
                          : folder.status === 'processing'
                            ? 'text-info animate-pulse'
                            : 'text-accent'
                    }`}
                  >
                    {folder.status === 'done'
                      ? 'check_circle'
                      : folder.status === 'error'
                        ? 'error'
                        : 'folder'}
                  </span>

                  <input
                    type="text"
                    value={folder.title}
                    onChange={(e) => updateFolder(folder.key, { title: e.target.value })}
                    disabled={folder.status !== 'queued'}
                    placeholder={folder.folderName}
                    className="flex-1 min-w-0 bg-transparent border-b border-hairline focus:border-accent text-xs font-mono-data text-ink py-1 focus:outline-none disabled:text-ink-faint"
                  />

                  {folder.status === 'queued' && (
                    <button
                      type="button"
                      onClick={() => removeFolder(folder.key)}
                      className="text-ink-faint hover:text-critical p-0.5 shrink-0"
                      title="Remove folder"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono-data text-ink-faint">
                  <span className="flex items-center gap-2.5">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">image</span>
                      {folder.imageCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">videocam</span>
                      {folder.videoCount}
                    </span>
                    {folder.relativePath && (
                      <span className="truncate max-w-[140px] text-accent/70">/{folder.relativePath}</span>
                    )}
                  </span>
                  <span className="truncate max-w-[150px] text-right">
                    {folder.status === 'processing' && folder.currentFile
                      ? `${folder.processed}/${folder.files.length} · ${folder.currentFile}`
                      : folder.status === 'done'
                        ? 'Ingested'
                        : folder.status === 'error'
                          ? folder.error
                          : 'Ready'}
                  </span>
                </div>

                {folder.status === 'processing' && (
                  <div className="w-full bg-surface-raised h-1 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-accent to-info h-full rounded-full transition-all"
                      style={{ width: `${(folder.processed / Math.max(folder.files.length, 1)) * 100}%` }}
                    ></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono-data">
          {/* Manual title only applies when no folders are queued — with folders,
              each folder's own editable title is used instead. */}
          {folders.length === 0 && (
            <div>
              <label className="text-ink-faint uppercase tracking-wider block mb-1.5">
                Project Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Kyoto Sunset Editorial"
                className="w-full bg-surface border border-hairline rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-ink-faint uppercase tracking-wider block mb-1.5">
                Client / Organization
              </label>
              <input
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                disabled={isProcessing}
                placeholder="e.g. Vogue Japan"
                className="w-full bg-surface border border-hairline rounded-xl px-3 py-2.5 text-ink focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-ink-faint uppercase tracking-wider block mb-1.5">
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={isProcessing}
                placeholder="e.g. Kyoto, Japan"
                className="w-full bg-surface border border-hairline rounded-xl px-3 py-2.5 text-ink focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-hairline">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 py-2.5 bg-surface border border-hairline hover:bg-surface-hover disabled:opacity-50 rounded-xl text-xs font-mono-data text-ink transition-colors"
            >
              {allDone ? 'Done' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSaving || isProcessing || (folders.length === 0 && !title.trim()) || allDone}
              className="flex-1 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white rounded-xl text-xs font-mono-data font-bold transition-colors"
            >
              {isProcessing
                ? `Processing ${totalProcessed}/${totalFiles}...`
                : allDone
                  ? 'All Folders Ingested'
                  : folders.length > 0
                    ? `Process ${folders.length} ${folders.length === 1 ? 'Folder' : 'Folders'}`
                    : isSaving
                      ? 'Creating...'
                      : 'Create Project'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

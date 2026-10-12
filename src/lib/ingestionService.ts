import { supabase, isSupabaseConfigured, MEDIA_BUCKET } from './supabaseClient';
import { MediaAsset } from '../types';
import { analyzeImage } from './aiDetection';
import { generateVideoPoster } from './vision/mediaFrame';
import { assetToRow, assetRowToAsset } from './mappers';
import { uuid } from './id';

export interface IngestOptions {
  projectId: string;
  projectName?: string;
  userId?: string;
}

/** A folder of files destined for one project. Used by folder drag-and-drop. */
export interface FolderBatch {
  /** Folder name as dropped, used as the default project title. */
  folderName: string;
  /** Relative path of the folder within the drop, for nested folders. */
  relativePath: string;
  files: File[];
  imageCount: number;
  videoCount: number;
}

export interface IngestProgress {
  fileName: string;
  stage: 'uploading' | 'analyzing' | 'saving' | 'done' | 'error';
  message: string;
}

function computeAspectRatio(width?: number, height?: number): MediaAsset['aspectRatio'] {
  if (!width || !height) return 'square';
  const ratio = width / height;
  if (ratio > 1.9) return 'panoramic';
  if (ratio > 1.15) return 'wide';
  if (ratio < 0.85) return 'tall';
  return 'square';
}

/**
 * Uploads a single file to Supabase Storage, runs it through the fully
 * client-side detection pipeline (human.js + ONNX YOLO, with a heuristic
 * fallback), and persists the resulting classification as a media_assets row.
 *
 * If Supabase isn't configured, everything happens client-side only
 * (object URLs + heuristic classification) so the app still works standalone.
 */
export async function ingestFile(
  file: File,
  options: IngestOptions,
  onProgress?: (p: IngestProgress) => void
): Promise<MediaAsset> {
  const id = uuid();
  let thumbnailUrl = URL.createObjectURL(file);
  let originalUrl = thumbnailUrl;

  if (isSupabaseConfigured && options.userId) {
    onProgress?.({ fileName: file.name, stage: 'uploading', message: 'Uploading to storage...' });
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const path = `${options.userId}/${options.projectId}/${id}-${safeFileName}`;
    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    });

    if (uploadError) {
      throw new Error(`Could not upload ${file.name}: ${uploadError.message}`);
    }
    const { data: publicUrlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    if (publicUrlData?.publicUrl) {
      originalUrl = publicUrlData.publicUrl;
      thumbnailUrl = publicUrlData.publicUrl;
    }
  }

  onProgress?.({ fileName: file.name, stage: 'analyzing', message: 'Analyzing media…' });
  const analysis = await analyzeImage(file);

  // Videos can't be shown in an <img>, so render a still poster frame and use
  // it as the thumbnail. Falls back gracefully (posterUrl stays undefined and
  // tiles show a video icon) if the frame can't be decoded.
  let posterUrl: string | undefined;
  if (analysis.mediaKind === 'video') {
    const posterBlob = await generateVideoPoster(file);
    if (posterBlob) {
      if (isSupabaseConfigured && options.userId) {
        const posterPath = `${options.userId}/${options.projectId}/${id}-poster.jpg`;
        const { error: posterError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(posterPath, posterBlob, { cacheControl: '3600', upsert: true, contentType: 'image/jpeg' });
        if (!posterError) {
          const { data: posterUrlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(posterPath);
          if (posterUrlData?.publicUrl) posterUrl = posterUrlData.publicUrl;
        }
      }
      if (!posterUrl) posterUrl = URL.createObjectURL(posterBlob);
      // Point the thumbnail at the poster so any <img> renders a real frame.
      thumbnailUrl = posterUrl;
    }
  }

  const asset: MediaAsset = {
    id,
    projectId: options.projectId,
    projectName: options.projectName,
    fileName: file.name,
    fileSizeBytes: file.size,
    mimeType: file.type,
    capturedAt: new Date().toISOString(),
    importedAt: 'Just now',

    mediaKind: analysis.mediaKind,
    durationSeconds: analysis.durationSeconds,

    primaryCategory: analysis.primaryCategory,
    aiConfidenceScore: analysis.aiConfidenceScore,
    aiMoodAnalysis: analysis.aiMoodAnalysis,
    aiHumanDetails: analysis.aiHumanDetails,
    aiObjectDetails: analysis.aiObjectDetails,
    lightingQuality: analysis.lightingQuality,

    tier1Tags: analysis.tier1Tags,
    tier2Tags: analysis.tier2Tags,

    autoOrganizedBucket: analysis.autoOrganizedBucket,
    routeStatus: analysis.aiConfidenceScore >= 0.8 ? 'auto_routed' : 'review_needed',
    aspectRatio: computeAspectRatio(analysis.frameWidth, analysis.frameHeight),
    thumbnailUrl,
    originalUrl,
    posterUrl,
    isFavorite: false,
    isSelected: false,
    isEdited: false
  };

  if (isSupabaseConfigured && options.userId) {
    onProgress?.({ fileName: file.name, stage: 'saving', message: 'Saving to catalog...' });
    const { data, error } = await supabase
      .from('media_assets')
      .insert({ ...assetToRow(asset), user_id: options.userId })
      .select()
      .single();

    if (!error && data) {
      onProgress?.({ fileName: file.name, stage: 'done', message: 'Complete' });
      return assetRowToAsset(data);
    }
  }

  onProgress?.({ fileName: file.name, stage: 'done', message: 'Complete (local only)' });
  return asset;
}

/**
 * The storage object paths a single asset occupies: its media file plus, for
 * videos, the generated poster frame. Kept next to the upload logic so the
 * delete path can never drift from the convention `ingestFile` writes to.
 */
export function assetStoragePaths(asset: MediaAsset, userId: string): string[] {
  const base = `${userId}/${asset.projectId}`;
  const safeFileName = asset.fileName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const paths = [`${base}/${asset.id}-${safeFileName}`];
  if (asset.mediaKind === 'video') paths.push(`${base}/${asset.id}-poster.jpg`);
  return paths;
}

/** Removes every storage object belonging to the given assets, in one call. */
export async function removeAssetsFromStorage(assets: MediaAsset[], userId: string): Promise<void> {
  if (!isSupabaseConfigured || assets.length === 0) return;
  const paths = assets.flatMap((a) => assetStoragePaths(a, userId));
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(MEDIA_BUCKET).remove(paths);
  } catch {
    // Best-effort cleanup — a failed storage delete shouldn't block the DB delete.
  }
}

export async function ingestFiles(
  files: File[],
  options: IngestOptions,
  onProgress?: (p: IngestProgress) => void
): Promise<MediaAsset[]> {
  const results: MediaAsset[] = [];
  for (const file of files) {
    // Sequential on purpose: keeps AI vision calls from bursting the API
    // and lets the UI show per-file progress.
    // eslint-disable-next-line no-await-in-loop
    const asset = await ingestFile(file, options, onProgress);
    results.push(asset);
  }
  return results;
}

// ---------- Folder drag-and-drop ----------

const MEDIA_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|mp4|webm|mov|m4v|avi|mkv|ogv|cr2|cr3|raf|arw|nef|dng|raw)$/i;

/** Ignores OS/editor cruft that shows up when dragging real folders in. */
function isIgnoredFile(name: string): boolean {
  return name.startsWith('.') || name === 'Thumbs.db' || name === 'desktop.ini';
}

export function isMediaFile(file: File): boolean {
  if (isIgnoredFile(file.name)) return false;
  if (file.type.startsWith('image/') || file.type.startsWith('video/')) return true;
  // RAW and some video containers come through with an empty MIME type.
  return MEDIA_EXTENSIONS.test(file.name);
}

function isVideo(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv|ogv)$/i.test(file.name);
}

/**
 * Recursively walks a dropped FileSystemEntry, tagging each file with the
 * folder path it came from. That path is what keeps assets in the right
 * project when several folders are dropped at once.
 */
async function walkEntry(entry: any, pathPrefix: string, out: { file: File; path: string }[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file(resolve, reject);
    });
    out.push({ file, path: pathPrefix });
    return;
  }

  if (entry.isDirectory) {
    const reader = entry.createReader();
    const nextPrefix = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;

    // readEntries returns at most ~100 entries per call, so it has to be
    // drained in a loop until it yields an empty batch.
    const readBatch = () =>
      new Promise<any[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });

    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const entries = await readBatch();
      if (entries.length === 0) break;
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(entries.map((child) => walkEntry(child, nextPrefix, out)));
    }
  }
}

function groupIntoBatches(tagged: { file: File; path: string }[]): FolderBatch[] {
  const byPath = new Map<string, File[]>();

  for (const { file, path } of tagged) {
    if (!isMediaFile(file)) continue;
    const key = path || '';
    const existing = byPath.get(key);
    if (existing) existing.push(file);
    else byPath.set(key, [file]);
  }

  const batches: FolderBatch[] = [];
  for (const [path, files] of byPath) {
    if (files.length === 0) continue;
    // Deepest folder segment is the most meaningful name for the project.
    const folderName = path ? path.split('/').filter(Boolean).slice(-1)[0] : 'Loose Files';
    batches.push({
      folderName,
      relativePath: path,
      files,
      imageCount: files.filter((f) => !isVideo(f)).length,
      videoCount: files.filter((f) => isVideo(f)).length
    });
  }

  // Folders with the most media first — usually the ones the user cares about.
  return batches.sort((a, b) => b.files.length - a.files.length);
}

/**
 * Reads folders out of a drag-and-drop event.
 *
 * Uses the `webkitGetAsEntry` API, which is the only way a browser exposes
 * directory structure from a drop. Each top-level folder becomes its own batch
 * so it can be ingested into its own project; nested subfolders are grouped
 * under their own path, keeping images and videos from different folders
 * strictly separate.
 */
export async function readFolderBatchesFromDrop(dataTransfer: DataTransfer): Promise<FolderBatch[]> {
  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .filter((item) => item.kind === 'file')
    .map((item) => (typeof (item as any).webkitGetAsEntry === 'function' ? (item as any).webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length === 0) {
    // Browser didn't give us directory entries — treat the drop as loose files.
    const files = Array.from(dataTransfer.files || []).filter(isMediaFile);
    return files.length > 0
      ? [{
          folderName: 'Dropped Files',
          relativePath: '',
          files,
          imageCount: files.filter((f) => !isVideo(f)).length,
          videoCount: files.filter((f) => isVideo(f)).length
        }]
      : [];
  }

  const tagged: { file: File; path: string }[] = [];
  await Promise.all(entries.map((entry: any) => walkEntry(entry, '', tagged)));
  return groupIntoBatches(tagged);
}

/**
 * Groups files chosen through an `<input webkitdirectory>` picker, which
 * exposes folder structure via `webkitRelativePath` instead of entries.
 */
export function readFolderBatchesFromFileList(fileList: FileList | File[]): FolderBatch[] {
  const tagged = Array.from(fileList).map((file) => {
    const rel = (file as any).webkitRelativePath as string | undefined;
    // Drop the filename, keep the directory path.
    const path = rel ? rel.split('/').slice(0, -1).join('/') : '';
    return { file, path };
  });
  return groupIntoBatches(tagged);
}

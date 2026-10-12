import { MediaAsset, MediaKind, PrimaryCategory, Project } from '../types';

/**
 * Rows written before the Objects and Environment buckets were merged still
 * carry primary_category = 'object' or 'environment'. Both now map to
 * 'nonhuman' so old catalogs keep loading without a migration.
 */
function coercePrimaryCategory(value: unknown): PrimaryCategory {
  return value === 'human' ? 'human' : 'nonhuman';
}

/**
 * media_kind was added with the Videos bucket. For rows written before it
 * existed, fall back to the MIME type, then the file extension.
 */
function coerceMediaKind(row: any): MediaKind {
  if (row.media_kind === 'video' || row.media_kind === 'image') return row.media_kind;
  if (typeof row.mime_type === 'string' && row.mime_type.startsWith('video/')) return 'video';
  if (typeof row.file_name === 'string' && /\.(mp4|webm|mov|m4v|avi|mkv|ogv)$/i.test(row.file_name)) return 'video';
  return 'image';
}

// ---------- Projects ----------

export function projectRowToProject(row: any): Project {
  return {
    id: row.id,
    title: row.title,
    client: row.client ?? undefined,
    date: row.date ?? '',
    location: row.location ?? '',
    coverUrl: row.cover_url ?? '',
    assetCount: row.asset_count ?? 0,
    videoCount: row.video_count ?? 0,
    status: row.status ?? 'processing',
    syncProgress: row.sync_progress ?? undefined,
    faces: row.faces ?? []
  };
}

export function projectToRow(project: Project) {
  return {
    id: project.id,
    title: project.title,
    client: project.client ?? null,
    date: project.date ?? null,
    location: project.location ?? null,
    cover_url: project.coverUrl ?? null,
    asset_count: project.assetCount ?? 0,
    video_count: project.videoCount ?? 0,
    status: project.status ?? 'processing',
    sync_progress: project.syncProgress ?? null,
    faces: project.faces ?? []
  };
}

// ---------- Media Assets ----------

export function assetRowToAsset(row: any): MediaAsset {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name ?? undefined,
    fileName: row.file_name,
    fileSizeBytes: Number(row.file_size_bytes ?? 0),
    mimeType: row.mime_type ?? '',
    capturedAt: row.captured_at ?? row.created_at,
    importedAt: row.imported_at ?? row.created_at,

    mediaKind: coerceMediaKind(row),
    durationSeconds: row.duration_seconds ?? undefined,

    primaryCategory: coercePrimaryCategory(row.primary_category),
    aiConfidenceScore: Number(row.ai_confidence_score ?? 0),
    aiMoodAnalysis: row.ai_mood_analysis ?? undefined,
    aiHumanDetails: row.ai_human_details ?? undefined,
    aiObjectDetails: row.ai_object_details ?? undefined,
    lightingQuality: row.lighting_quality ?? undefined,

    tier1Tags: row.tier1_tags ?? [],
    tier2Tags: row.tier2_tags ?? [],

    autoOrganizedBucket: row.auto_organized_bucket ?? '',
    routeStatus: row.route_status ?? 'processing',
    aspectRatio: row.aspect_ratio ?? 'square',
    thumbnailUrl: row.thumbnail_url ?? '',
    originalUrl: row.original_url ?? '',
    posterUrl: row.poster_url ?? undefined,

    isFavorite: row.is_favorite ?? false,
    isSelected: row.is_selected ?? false,
    isEdited: row.is_edited ?? false,
    rating: row.rating ?? undefined
  };
}

export function assetToRow(asset: MediaAsset) {
  return {
    id: asset.id,
    project_id: asset.projectId,
    project_name: asset.projectName ?? null,
    file_name: asset.fileName,
    file_size_bytes: asset.fileSizeBytes ?? 0,
    mime_type: asset.mimeType ?? null,
    captured_at: asset.capturedAt ?? null,
    imported_at: new Date().toISOString(),

    media_kind: asset.mediaKind ?? 'image',
    duration_seconds: asset.durationSeconds ?? null,

    primary_category: asset.primaryCategory,
    ai_confidence_score: asset.aiConfidenceScore ?? 0,
    ai_mood_analysis: asset.aiMoodAnalysis ?? null,
    ai_human_details: asset.aiHumanDetails ?? null,
    ai_object_details: asset.aiObjectDetails ?? null,
    lighting_quality: asset.lightingQuality ?? null,

    tier1_tags: asset.tier1Tags ?? [],
    tier2_tags: asset.tier2Tags ?? [],

    auto_organized_bucket: asset.autoOrganizedBucket ?? null,
    route_status: asset.routeStatus ?? 'processing',
    aspect_ratio: asset.aspectRatio ?? 'square',
    thumbnail_url: asset.thumbnailUrl ?? null,
    original_url: asset.originalUrl ?? null,
    poster_url: asset.posterUrl ?? null,

    is_favorite: asset.isFavorite ?? false,
    is_selected: asset.isSelected ?? false,
    is_edited: asset.isEdited ?? false,
    rating: asset.rating ?? null
  };
}

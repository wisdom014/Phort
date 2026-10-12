import { MediaAsset } from '../types';

/**
 * Storage accounting for the catalog.
 *
 * "Used" is the real sum of every stored asset's byte size — it grows only as
 * media is actually ingested and shrinks when assets or projects are deleted.
 *
 * The quota is the Supabase free-plan file-storage limit (1 GB). Supabase does
 * not expose live bucket usage through the anon client, so the honest figure we
 * can show is bytes-we-stored against the plan limit. If you are on a paid plan,
 * change STORAGE_QUOTA_BYTES to your plan's storage allowance.
 */
export const STORAGE_QUOTA_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB (Supabase free tier)

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  /** 0–100, clamped. */
  percentUsed: number;
  assetCount: number;
}

export function computeStorage(assets: MediaAsset[], quotaBytes = STORAGE_QUOTA_BYTES): StorageUsage {
  const usedBytes = assets.reduce((sum, a) => sum + (a.fileSizeBytes || 0), 0);
  const remainingBytes = Math.max(0, quotaBytes - usedBytes);
  const percentUsed = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;
  return { usedBytes, quotaBytes, remainingBytes, percentUsed, assetCount: assets.length };
}

/** Human-readable byte size, e.g. 0 B, 4.2 MB, 1.1 GB. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  const decimals = value >= 100 || i === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[i]}`;
}

import { LightingQuality } from '../../types';
import { isVideoType } from './mediaFrame';

/**
 * Lighting-quality analysis.
 *
 * This is deliberately separate from `environment.ts`, which guesses the
 * *style* of the light (golden hour, neon, low key). This module answers a
 * different, objective question: is the footage actually well exposed? That's
 * what the Videos bucket sorts on, so it needs to be measured rather than
 * inferred from labels.
 *
 * For video we sample several frames spread across the clip instead of one
 * representative frame — a clip can open well lit and drift into darkness, and
 * a single frame would hide that.
 */

/** How many frames to sample across a video clip. */
const VIDEO_SAMPLE_COUNT = 5;
/** Downscale size for pixel sampling; plenty for luma statistics and fast. */
const SAMPLE_SIZE = 64;
/** Luma at/below this counts as crushed black. */
const SHADOW_FLOOR = 16;
/** Luma at/above this counts as blown white. */
const HIGHLIGHT_CEIL = 245;
/** Scores at or above this are 'good'. */
const GOOD_SCORE_THRESHOLD = 60;

interface FrameStats {
  brightness: number;
  contrast: number;
  shadowClipping: number;
  highlightClipping: number;
}

/**
 * Per-frame luma statistics from a downscaled sample.
 * Uses Rec. 601 luma weights rather than a flat RGB average, so perceived
 * brightness matches how the footage actually reads to a viewer.
 */
function measureFrame(source: CanvasImageSource, width: number, height: number): FrameStats {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, width, height, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  const pixelCount = SAMPLE_SIZE * SAMPLE_SIZE;
  const lumas = new Float32Array(pixelCount);
  let lumaSum = 0;
  let shadowCount = 0;
  let highlightCount = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lumas[p] = luma;
    lumaSum += luma;
    if (luma <= SHADOW_FLOOR) shadowCount += 1;
    if (luma >= HIGHLIGHT_CEIL) highlightCount += 1;
  }

  const brightness = lumaSum / pixelCount;

  let varianceSum = 0;
  for (let p = 0; p < pixelCount; p += 1) {
    const delta = lumas[p] - brightness;
    varianceSum += delta * delta;
  }

  return {
    brightness,
    contrast: Math.sqrt(varianceSum / pixelCount),
    shadowClipping: shadowCount / pixelCount,
    highlightClipping: highlightCount / pixelCount
  };
}

/**
 * Turns raw statistics into a 0-100 score plus the reasons behind it.
 *
 * Starts from a perfect score and deducts for each specific defect, so the
 * reasons list always explains the number. Weightings favour brightness and
 * clipping, because those are the failures that make footage unusable —
 * flat contrast can be graded back, crushed blacks cannot.
 */
function scoreLighting(stats: FrameStats, exposureVariance: number): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;

  // Brightness — the dominant factor. Ideal window is roughly 85-175 luma.
  if (stats.brightness < 40) {
    score -= 45;
    reasons.push('Severely underexposed');
  } else if (stats.brightness < 70) {
    score -= 25;
    reasons.push('Underexposed');
  } else if (stats.brightness > 215) {
    score -= 40;
    reasons.push('Severely overexposed');
  } else if (stats.brightness > 185) {
    score -= 20;
    reasons.push('Overexposed');
  }

  // Contrast — flat footage reads as muddy or hazy.
  if (stats.contrast < 18) {
    score -= 22;
    reasons.push('Very flat, low contrast');
  } else if (stats.contrast < 30) {
    score -= 10;
    reasons.push('Low contrast');
  }

  // Clipping — unrecoverable detail loss.
  if (stats.shadowClipping > 0.35) {
    score -= 25;
    reasons.push('Heavily crushed shadows');
  } else if (stats.shadowClipping > 0.18) {
    score -= 12;
    reasons.push('Crushed shadows');
  }

  if (stats.highlightClipping > 0.2) {
    score -= 25;
    reasons.push('Blown highlights');
  } else if (stats.highlightClipping > 0.08) {
    score -= 12;
    reasons.push('Clipped highlights');
  }

  // Exposure drift between frames — flicker, or auto-exposure hunting.
  if (exposureVariance > 30) {
    score -= 20;
    reasons.push('Unstable exposure across clip');
  } else if (exposureVariance > 15) {
    score -= 8;
    reasons.push('Noticeable exposure shift');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (reasons.length === 0) {
    reasons.push(stats.contrast > 55 ? 'Well exposed, strong contrast' : 'Well exposed');
  }

  return { score, reasons };
}

function buildQuality(frames: FrameStats[], framesSampled: number): LightingQuality {
  const mean = (pick: (f: FrameStats) => number) =>
    frames.reduce((sum, f) => sum + pick(f), 0) / frames.length;

  const averaged: FrameStats = {
    brightness: mean((f) => f.brightness),
    contrast: mean((f) => f.contrast),
    shadowClipping: mean((f) => f.shadowClipping),
    highlightClipping: mean((f) => f.highlightClipping)
  };

  // Spread of per-frame brightness, expressed 0-100, as a flicker/drift signal.
  let exposureVariance = 0;
  if (frames.length > 1) {
    const brightnesses = frames.map((f) => f.brightness);
    const spread = Math.max(...brightnesses) - Math.min(...brightnesses);
    exposureVariance = Math.round(Math.min(100, (spread / 255) * 100));
  }

  const { score, reasons } = scoreLighting(averaged, exposureVariance);

  return {
    verdict: score >= GOOD_SCORE_THRESHOLD ? 'good' : 'bad',
    score,
    brightness: Math.round(averaged.brightness * 10) / 10,
    contrast: Math.round(averaged.contrast * 10) / 10,
    shadowClipping: Math.round(averaged.shadowClipping * 1000) / 1000,
    highlightClipping: Math.round(averaged.highlightClipping * 1000) / 1000,
    exposureVariance,
    framesSampled,
    reasons
  };
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => resolve();
    const onError = () => reject(new Error('Video seek failed during lighting analysis.'));
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = time;
  });
}

/**
 * Samples frames evenly across a video clip and measures lighting on each.
 *
 * Skips the first and last 8% of the clip — fades, slates and black frames at
 * the edges are not representative of the footage and would drag the score
 * down unfairly.
 */
export async function analyzeVideoLighting(file: File): Promise<LightingQuality & { durationSeconds: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('Could not load video for lighting analysis.')), { once: true });
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const frames: FrameStats[] = [];

    if (duration <= 0) {
      // Streaming or unknown-duration source: measure whatever frame is decoded.
      frames.push(measureFrame(video, video.videoWidth, video.videoHeight));
    } else {
      const start = duration * 0.08;
      const end = duration * 0.92;
      const span = Math.max(end - start, 0);

      // Divisor guards against VIDEO_SAMPLE_COUNT being tuned down to 1.
      const stepDivisor = Math.max(VIDEO_SAMPLE_COUNT - 1, 1);

      for (let i = 0; i < VIDEO_SAMPLE_COUNT; i += 1) {
        const t = start + (span * i) / stepDivisor;
        try {
          // eslint-disable-next-line no-await-in-loop
          await seekTo(video, Math.min(t, Math.max(duration - 0.05, 0)));
          frames.push(measureFrame(video, video.videoWidth, video.videoHeight));
        } catch {
          // A failed seek on one sample point shouldn't sink the whole analysis.
        }
      }
    }

    if (frames.length === 0) {
      throw new Error('Could not sample any frames for lighting analysis.');
    }

    return { ...buildQuality(frames, frames.length), durationSeconds: Math.round(duration * 10) / 10 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Measures lighting on a single already-decoded frame (used for stills). */
export function analyzeCanvasLighting(canvas: HTMLCanvasElement): LightingQuality {
  return buildQuality([measureFrame(canvas, canvas.width, canvas.height)], 1);
}

/**
 * Neutral placeholder for media we can't decode in-browser (RAW stills, exotic
 * codecs). Scored mid-range so it doesn't get labelled badly lit on no evidence.
 */
export function unknownLightingQuality(): LightingQuality {
  return {
    verdict: 'good',
    score: GOOD_SCORE_THRESHOLD,
    brightness: 0,
    contrast: 0,
    shadowClipping: 0,
    highlightClipping: 0,
    exposureVariance: 0,
    framesSampled: 0,
    reasons: ['Lighting not analyzed — format could not be decoded in-browser']
  };
}

export function isVideoFile(file: File): boolean {
  return isVideoType(file.type) || /\.(mp4|webm|mov|m4v|avi|mkv|ogv)$/i.test(file.name);
}

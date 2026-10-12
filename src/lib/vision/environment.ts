import { Detection } from './yolo';
import { AIObjectDetection } from '../../types';

// Object labels that are reasonably strong indoor/outdoor/urban/landscape signals.
const INDOOR_LABELS = new Set([
  'chair', 'couch', 'bed', 'dining table', 'tv', 'laptop', 'microwave', 'oven',
  'toaster', 'sink', 'refrigerator', 'toilet', 'potted plant', 'book', 'vase'
]);
const URBAN_LABELS = new Set([
  'car', 'bus', 'truck', 'traffic light', 'stop sign', 'parking meter', 'bicycle',
  'motorcycle', 'fire hydrant', 'bench'
]);
const LANDSCAPE_LABELS = new Set(['bird', 'horse', 'cow', 'sheep', 'elephant', 'bear', 'zebra', 'giraffe', 'boat']);

export type EnvironmentGuess = Pick<AIObjectDetection, 'environment' | 'lightingStyle'>;

/** Average brightness (0-255) and warm/cool color bias from a downscaled sample of the canvas. */
function samplePixelStats(canvas: HTMLCanvasElement) {
  const sampleSize = 64;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;
  const ctx = sampleCanvas.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, sampleSize, sampleSize);
  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

  let rSum = 0, gSum = 0, bSum = 0;
  const pixelCount = sampleSize * sampleSize;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }
  const rAvg = rSum / pixelCount;
  const gAvg = gSum / pixelCount;
  const bAvg = bSum / pixelCount;
  const brightness = (rAvg + gAvg + bAvg) / 3;
  const warmth = rAvg - bAvg; // positive = warm (orange/red cast), negative = cool (blue cast)

  return { brightness, warmth };
}

function guessEnvironment(labels: string[]): AIObjectDetection['environment'] {
  const lower = labels.map((l) => l.toLowerCase());
  const indoorHits = lower.filter((l) => INDOOR_LABELS.has(l)).length;
  const urbanHits = lower.filter((l) => URBAN_LABELS.has(l)).length;
  const landscapeHits = lower.filter((l) => LANDSCAPE_LABELS.has(l)).length;

  if (indoorHits >= urbanHits && indoorHits >= landscapeHits && indoorHits > 0) return 'indoor';
  if (urbanHits >= landscapeHits && urbanHits > 0) return 'urban';
  if (landscapeHits > 0) return 'landscape';
  return 'outdoor';
}

function guessLighting(brightness: number, warmth: number): AIObjectDetection['lightingStyle'] {
  if (brightness < 60) return 'night';
  if (brightness > 210) return 'high_key';
  if (warmth > 25) return 'golden_hour';
  if (warmth < -15) return 'low_key';
  return 'natural_diffused';
}

/**
 * Infers environment + lighting from detected object labels and basic pixel
 * statistics (brightness, warm/cool color cast). This is a heuristic, not a
 * trained scene classifier — it replaces the old CLIP-based zero-shot
 * classification that ran server-side; see SETUP.md for context on why.
 */
export function inferEnvironment(canvas: HTMLCanvasElement, detections: Detection[]): EnvironmentGuess {
  const labels = detections.map((d) => d.label);
  const { brightness, warmth } = samplePixelStats(canvas);

  return {
    environment: guessEnvironment(labels),
    lightingStyle: guessLighting(brightness, warmth)
  };
}

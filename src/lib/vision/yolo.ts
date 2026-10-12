import * as ort from 'onnxruntime-web/wasm';
// Import the WASM runtime as proper Vite-managed assets (not from /public).
// onnxruntime-web's wasm backend dynamically `import()`s its .mjs loader at
// runtime; Vite's dev server refuses to do that for files served raw out of
// /public ("should not be imported from source code"). Using new URL(...)
// with a relative disk path (rather than a bare "onnxruntime-web/dist/..."
// specifier, which onnxruntime-web's package.json "exports" map blocks as a
// deep import) routes these through Vite's asset pipeline correctly.
const ortWasmUrl = new URL('../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', import.meta.url).href;
const ortWasmMjsUrl = new URL('../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', import.meta.url).href;

// COCO 80 class names, in the exact order used by YOLOv8 training/export.
export const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
  'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
  'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
  'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
  'hair drier', 'toothbrush'
] as const;

const MODEL_INPUT_SIZE = 640;
const CONF_THRESHOLD = 0.35;
const IOU_THRESHOLD = 0.45;
const MODEL_URL = '/models/yolov8n.onnx';

export interface Detection {
  label: string;
  classId: number;
  confidence: number;
  /** pixel-space box in the ORIGINAL image, [x1, y1, x2, y2] */
  box: [number, number, number, number];
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    // Object form keys must be exactly "wasm" and "mjs" — onnxruntime-web reads
    // env.wasm.wasmPaths.wasm / .mjs directly (not a directory-prefix + filename join).
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortWasmMjsUrl };
    // Threaded WASM needs cross-origin isolation (COOP/COEP) headers that most static
    // hosts don't set by default; running single-threaded avoids that requirement.
    ort.env.wasm.numThreads = 1;
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm']
    });
  }
  return sessionPromise;
}

/** Draws `source` letterboxed (aspect-preserving, padded) onto a 640x640 canvas. */
function letterbox(source: CanvasImageSource, srcW: number, srcH: number) {
  const canvas = document.createElement('canvas');
  canvas.width = MODEL_INPUT_SIZE;
  canvas.height = MODEL_INPUT_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const scale = Math.min(MODEL_INPUT_SIZE / srcW, MODEL_INPUT_SIZE / srcH);
  const resizedW = Math.round(srcW * scale);
  const resizedH = Math.round(srcH * scale);
  const padX = Math.floor((MODEL_INPUT_SIZE - resizedW) / 2);
  const padY = Math.floor((MODEL_INPUT_SIZE - resizedH) / 2);

  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  ctx.drawImage(source, 0, 0, srcW, srcH, padX, padY, resizedW, resizedH);

  const { data } = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  return { data, scale, padX, padY };
}

/** RGBA Uint8ClampedArray (HWC) -> normalized float32 CHW tensor, dropping alpha. */
function toChwTensor(rgba: Uint8ClampedArray): Float32Array {
  const plane = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const srcIdx = i * 4;
    chw[i] = rgba[srcIdx] / 255;
    chw[plane + i] = rgba[srcIdx + 1] / 255;
    chw[2 * plane + i] = rgba[srcIdx + 2] / 255;
  }
  return chw;
}

function iou(a: Detection, b: Detection): number {
  const [ax1, ay1, ax2, ay2] = a.box;
  const [bx1, by1, bx2, by2] = b.box;
  const x1 = Math.max(ax1, bx1);
  const y1 = Math.max(ay1, by1);
  const x2 = Math.min(ax2, bx2);
  const y2 = Math.min(ay2, by2);
  const interArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (ax2 - ax1) * (ay2 - ay1);
  const areaB = (bx2 - bx1) * (by2 - by1);
  return interArea / (areaA + areaB - interArea);
}

function nms(detections: Detection[], iouThreshold: number): Detection[] {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const keep: Detection[] = [];
  while (sorted.length > 0) {
    const current = sorted.shift()!;
    keep.push(current);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].classId === current.classId && iou(current, sorted[i]) > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }
  return keep;
}

/** Decodes YOLOv8 output0 [1,84,8400] into boxes mapped back to original image pixel space. */
function decode(
  output: Float32Array,
  meta: { scale: number; padX: number; padY: number; srcW: number; srcH: number }
): Detection[] {
  const numAnchors = 8400;
  const numClasses = COCO_CLASSES.length;
  const { scale, padX, padY, srcW, srcH } = meta;

  const candidates: Detection[] = [];
  for (let i = 0; i < numAnchors; i++) {
    let bestScore = 0;
    let bestClass = -1;
    for (let c = 0; c < numClasses; c++) {
      const score = output[(4 + c) * numAnchors + i];
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }
    if (bestScore < CONF_THRESHOLD) continue;

    const cx = output[0 * numAnchors + i];
    const cy = output[1 * numAnchors + i];
    const w = output[2 * numAnchors + i];
    const h = output[3 * numAnchors + i];

    // Undo letterbox: model-space (640x640) -> original image pixel space
    const x1 = (cx - w / 2 - padX) / scale;
    const y1 = (cy - h / 2 - padY) / scale;
    const x2 = (cx + w / 2 - padX) / scale;
    const y2 = (cy + h / 2 - padY) / scale;

    candidates.push({
      box: [Math.max(0, x1), Math.max(0, y1), Math.min(srcW, x2), Math.min(srcH, y2)],
      confidence: bestScore,
      classId: bestClass,
      label: COCO_CLASSES[bestClass]
    });
  }

  return nms(candidates, IOU_THRESHOLD);
}

/**
 * Runs YOLOv8n object detection on an image/video source, entirely in the browser
 * via onnxruntime-web (WASM backend). Returns detections in the source's own pixel space.
 */
export async function detectObjects(
  source: CanvasImageSource,
  srcW: number,
  srcH: number
): Promise<Detection[]> {
  const session = await getSession();
  const { data, scale, padX, padY } = letterbox(source, srcW, srcH);
  const tensorData = toChwTensor(data);
  const tensor = new ort.Tensor('float32', tensorData, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);

  const feeds: Record<string, ort.Tensor> = { [session.inputNames[0]]: tensor };
  const results = await session.run(feeds);
  const output = results[session.outputNames[0]].data as Float32Array;

  return decode(output, { scale, padX, padY, srcW, srcH });
}

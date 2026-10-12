import Human from '@vladmandic/human';

// Config validated against real photos during development: with the default
// maxDetected (1), only the most prominent face in a multi-person photo was
// found, undercounting people — raised to 20 so group shots work correctly.
const humanConfig = {
  modelBasePath: '/models/human/',
  backend: 'webgl' as const,
  cacheModels: true,
  warmup: 'none' as const,
  face: {
    enabled: true,
    detector: { enabled: true, rotation: false, maxDetected: 20 },
    mesh: { enabled: true },
    iris: { enabled: false },
    description: { enabled: false },
    emotion: { enabled: true },
    antispoof: { enabled: false },
    liveness: { enabled: false }
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
  filter: { enabled: false }
};

let humanInstance: Human | null = null;
let loadPromise: Promise<Human> | null = null;

function getHuman(): Promise<Human> {
  if (!humanInstance) {
    // eslint-disable-next-line new-cap
    humanInstance = new Human(humanConfig);
  }
  if (!loadPromise) {
    loadPromise = humanInstance.load().then(() => humanInstance!);
  }
  return loadPromise;
}

export interface DetectedFace {
  /** pixel-space box in the source image, [x, y, width, height] */
  box: [number, number, number, number];
  score: number;
  dominantEmotion: string;
  emotionScores: Record<string, number>;
}

/**
 * Runs face detection + emotion analysis on an image/video source via human.js,
 * entirely in the browser (TensorFlow.js, WASM backend).
 */
export async function detectFaces(source: HTMLCanvasElement | HTMLImageElement): Promise<DetectedFace[]> {
  const human = await getHuman();
  const result = await human.detect(source);

  return result.face
    .filter((f) => Array.isArray(f.box) && f.box.length === 4 && f.box.every((n) => Number.isFinite(n)))
    .map((f) => {
      const emotionScores: Record<string, number> = {};
      for (const e of f.emotion ?? []) {
        emotionScores[e.emotion] = Math.round(e.score * 100);
      }
      const dominant = (f.emotion && f.emotion[0]?.emotion) || 'neutral';

      return {
        box: f.box as [number, number, number, number],
        score: f.score ?? f.boxScore ?? 0.5,
        dominantEmotion: dominant,
        emotionScores
      };
    });
}

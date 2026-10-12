export interface MediaFrame {
  /** A canvas holding a single representative frame, ready for canvas-based inference. */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** True if this frame was extracted from a video (as opposed to a still image). */
  isVideo: boolean;
}

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'];

export function isDetectableMediaType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(mimeType) || SUPPORTED_VIDEO_TYPES.includes(mimeType);
}

export function isVideoType(mimeType: string): boolean {
  return SUPPORTED_VIDEO_TYPES.includes(mimeType) || mimeType.startsWith('video/');
}

function drawToCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function extractImageFrame(file: File): Promise<MediaFrame> {
  const bitmap = await createImageBitmap(file);
  const canvas = drawToCanvas(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return { canvas, width: canvas.width, height: canvas.height, isVideo: false };
}

/**
 * Extracts a single representative frame from a video file for analysis.
 * Seeks to ~10% into the clip (never past 3s) rather than frame 0, since opening
 * frames are frequently black, fading in, or otherwise unrepresentative.
 */
async function extractVideoFrame(file: File): Promise<MediaFrame> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = () => reject(new Error('Could not load video for frame extraction.'));
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    const seekTo = Math.min(video.duration * 0.1 || 0, 3);
    await new Promise<void>((resolve, reject) => {
      const onError = () => reject(new Error('Could not seek video for frame extraction.'));
      video.addEventListener('seeked', () => resolve(), { once: true });
      video.addEventListener('error', onError, { once: true });
      video.currentTime = seekTo;
    });

    const canvas = drawToCanvas(video, video.videoWidth, video.videoHeight);
    return { canvas, width: canvas.width, height: canvas.height, isVideo: true };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Produces a single analyzable frame (as a canvas) from either an image or
 * video file. Video analysis only inspects one representative frame, not the
 * full clip — see python-service removal notes in SETUP.md for why per-frame
 * video analysis is out of scope for a media-cataloging tool.
 */
export async function extractMediaFrame(file: File): Promise<MediaFrame> {
  if (isVideoType(file.type)) {
    return extractVideoFrame(file);
  }
  return extractImageFrame(file);
}

/**
 * Encodes a canvas as a compact JPEG blob suitable for a thumbnail/poster.
 * Downscales to `maxWidth` so posters stay small regardless of source size.
 */
export async function canvasToPosterBlob(
  canvas: HTMLCanvasElement,
  maxWidth = 640,
  quality = 0.82
): Promise<Blob | null> {
  const scale = canvas.width > maxWidth ? maxWidth / canvas.width : 1;
  let target = canvas;
  if (scale < 1) {
    const scaled = document.createElement('canvas');
    scaled.width = Math.round(canvas.width * scale);
    scaled.height = Math.round(canvas.height * scale);
    scaled.getContext('2d')!.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    target = scaled;
  }
  if (typeof target.toBlob !== 'function') return null;
  return new Promise((resolve) => {
    target.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/**
 * Renders a representative still frame from a video as a JPEG blob, for use as
 * a poster image. Returns null for non-videos or if the frame can't be read
 * (some codecs won't decode in-browser) — callers fall back to an icon.
 */
export async function generateVideoPoster(
  file: File,
  maxWidth = 640,
  quality = 0.82
): Promise<Blob | null> {
  if (!isVideoType(file.type)) return null;
  try {
    const frame = await extractMediaFrame(file);
    if (!frame.isVideo) return null;
    return await canvasToPosterBlob(frame.canvas, maxWidth, quality);
  } catch {
    return null;
  }
}

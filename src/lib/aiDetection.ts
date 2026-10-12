import { AIHumanDetection, AIMoodAnalysis, AIObjectDetection, LightingQuality, MediaKind, PrimaryCategory } from '../types';
import { extractMediaFrame, isDetectableMediaType, isVideoType } from './vision/mediaFrame';
import { detectFaces, DetectedFace } from './vision/human';
import { detectObjects, Detection } from './vision/yolo';
import { inferEnvironment } from './vision/environment';
import { analyzeCanvasLighting, analyzeVideoLighting, unknownLightingQuality } from './vision/lighting';

export interface AIAnalysisResult {
  primaryCategory: PrimaryCategory;
  mediaKind: MediaKind;
  durationSeconds?: number;
  aiConfidenceScore: number;
  aiMoodAnalysis?: AIMoodAnalysis;
  aiHumanDetails?: AIHumanDetection;
  aiObjectDetails?: AIObjectDetection;
  lightingQuality?: LightingQuality;
  tier1Tags: { label: string; confidence: number }[];
  tier2Tags: { label: string; confidence: number }[];
  autoOrganizedBucket: string;
  /** Pixel dimensions of the analyzed frame, when available (used to compute aspect ratio). */
  frameWidth?: number;
  frameHeight?: number;
  /** 'local-model' = real human.js + YOLO ONNX result, 'fallback' = heuristic (models unavailable) */
  source: 'local-model' | 'fallback';
  error?: string;
}

const EMOTION_TO_MOOD: Record<string, AIMoodAnalysis['primaryMood']> = {
  happy: 'happy',
  surprise: 'surprised',
  sad: 'emotional',
  angry: 'serious',
  fear: 'introspective',
  disgust: 'serious',
  neutral: 'neutral'
};

function buildHumanDetails(faces: DetectedFace[], personCount: number, frameWidth: number, frameHeight: number): AIHumanDetection {
  const peopleCount = Math.max(faces.length, personCount, 1);

  let groupType: AIHumanDetection['groupType'];
  if (peopleCount === 1) groupType = 'solo';
  else if (peopleCount === 2) groupType = 'duo';
  else if (peopleCount <= 5) groupType = 'small_group';
  else groupType = 'crowd';

  const frameArea = Math.max(frameWidth * frameHeight, 1);
  const largestFaceFraction = faces.reduce((max, f) => Math.max(max, (f.box[2] * f.box[3]) / frameArea), 0);

  let shotType: AIHumanDetection['shotType'];
  if (largestFaceFraction > 0.12) shotType = 'portrait_close';
  else if (largestFaceFraction > 0.04) shotType = 'half_body';
  else if (largestFaceFraction > 0.01) shotType = 'full_body';
  else shotType = 'wide';

  const faceEntries = faces.map((f, i) => ({
    id: `f${i + 1}`,
    box: [
      Math.round((100 * f.box[1]) / frameHeight * 100) / 100,
      Math.round((100 * f.box[0]) / frameWidth * 100) / 100,
      Math.round((100 * f.box[2]) / frameWidth * 100) / 100,
      Math.round((100 * f.box[3]) / frameHeight * 100) / 100
    ] as [number, number, number, number],
    label: `Subject ${i + 1}`,
    confidence: Math.round(f.score * 1000) / 1000
  }));

  return {
    peopleCount,
    groupType,
    shotType,
    // human.js's detection pipeline doesn't reliably expose gaze direction or
    // eyelid state without an additional landmark model, so these are
    // conservative defaults rather than guesses.
    eyeContact: 'direct',
    eyesClosedDetected: false,
    faces: faceEntries
  };
}

function buildMoodAnalysis(faces: DetectedFace[], frameWidth: number, frameHeight: number): AIMoodAnalysis {
  if (faces.length === 0) {
    return {
      primaryMood: 'neutral',
      moodConfidence: 0.5,
      joyScore: 50,
      detectedEmotions: [{ emotion: 'Neutral', confidence: 0.5 }]
    };
  }

  const frameArea = Math.max(frameWidth * frameHeight, 1);
  const dominantFace = faces.reduce((largest, f) =>
    f.box[2] * f.box[3] > largest.box[2] * largest.box[3] ? f : largest
  , faces[0]);
  void frameArea;

  const mood = EMOTION_TO_MOOD[dominantFace.dominantEmotion] ?? 'neutral';
  const joyScore = dominantFace.emotionScores['happy'] ?? 0;

  const detectedEmotions = Object.entries(dominantFace.emotionScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([emotion, score]) => ({
      emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
      confidence: Math.round(score) / 100
    }));

  return {
    primaryMood: mood,
    moodConfidence: Math.round(dominantFace.score * 1000) / 1000,
    joyScore: Math.round(joyScore),
    detectedEmotions: detectedEmotions.length > 0 ? detectedEmotions : [{ emotion: 'Neutral', confidence: 0.5 }]
  };
}

function buildObjectDetails(detections: Detection[], canvas: HTMLCanvasElement): AIObjectDetection {
  const nonPerson = detections.filter((d) => d.label !== 'person').sort((a, b) => b.confidence - a.confidence);
  const seen = new Set<string>();
  const topLabels: string[] = [];
  for (const d of nonPerson) {
    const label = d.label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (!seen.has(label)) {
      seen.add(label);
      topLabels.push(label);
    }
    if (topLabels.length >= 5) break;
  }

  const { environment, lightingStyle } = inferEnvironment(canvas, detections);

  return {
    detectedLabels: topLabels.length > 0 ? topLabels : ['Unclassified'],
    environment,
    lightingStyle
  };
}

/** Title-cases an environment key like 'urban' for use in a bucket path. */
function environmentLabel(environment: AIObjectDetection['environment'] | undefined): string {
  if (!environment) return 'Details & Decor';
  const labels: Record<AIObjectDetection['environment'], string> = {
    indoor: 'Interiors',
    outdoor: 'Outdoors',
    studio: 'Studio',
    landscape: 'Landscapes',
    urban: 'Urban & Architecture',
    aerial: 'Aerial'
  };
  return labels[environment];
}

/**
 * Builds the smart-bucket path for an asset.
 *
 * Videos route by lighting quality, since that's what the Videos bucket sorts
 * on. Stills route by subject: people into /Humans, everything else into
 * /Non-Human (which absorbed the old separate Objects and Environment trees).
 */
function buildBucket(params: {
  mediaKind: MediaKind;
  primaryCategory: PrimaryCategory;
  mood?: AIMoodAnalysis;
  groupType?: AIHumanDetection['groupType'];
  environment?: AIObjectDetection['environment'];
  lighting?: LightingQuality;
}): string {
  const { mediaKind, primaryCategory, mood, groupType, environment, lighting } = params;

  if (mediaKind === 'video') {
    const lightingFolder = lighting?.verdict === 'bad' ? 'Bad Lighting' : 'Good Lighting';
    const subjectFolder = primaryCategory === 'human' ? 'Subjects' : 'B-Roll';
    return `/Videos/${lightingFolder}/${subjectFolder}`;
  }

  if (primaryCategory === 'human') {
    const groupLabel: Record<AIHumanDetection['groupType'], string> = {
      solo: 'Solo Portraits',
      duo: 'Couples & Duos',
      small_group: 'Group Shots',
      crowd: 'Group Shots'
    };
    const moodLabel = mood ? mood.primaryMood.charAt(0).toUpperCase() + mood.primaryMood.slice(1) : 'Neutral';
    return `/Humans/${groupLabel[groupType ?? 'solo']}/${moodLabel}`;
  }

  return `/Non-Human/${environmentLabel(environment)}`;
}

/**
 * Runs the real, fully client-side detection pipeline:
 *  - human.js (TensorFlow.js)  -> face detection + mood/emotion
 *  - ONNX YOLOv8n (onnxruntime-web) -> object detection, incl. person count cross-check
 *  - a lightweight pixel/label heuristic -> environment + lighting
 *
 * Everything runs in the browser — no server, no API key. Falls back to a
 * simple heuristic classifier if the models can't load (e.g. an unsupported
 * file type, or a browser without WebGL/WASM support) so ingestion never
 * fully blocks on it.
 */
export async function analyzeImage(file: File): Promise<AIAnalysisResult> {
  if (!isDetectableMediaType(file.type)) {
    return { ...localHeuristicAnalysis(file), source: 'fallback', error: `Unsupported type for live detection: ${file.type || 'unknown'}` };
  }

  const mediaKind: MediaKind = isVideoType(file.type) ? 'video' : 'image';

  try {
    const frame = await extractMediaFrame(file);
    const faces = await detectFaces(frame.canvas);
    const detections = await detectObjects(frame.canvas, frame.width, frame.height);
    const personCount = detections.filter((d) => d.label === 'person').length;

    // Videos get multi-frame lighting analysis across the clip; stills only
    // have the one frame to measure.
    let lightingQuality: LightingQuality;
    let durationSeconds: number | undefined;
    if (mediaKind === 'video') {
      try {
        const { durationSeconds: dur, ...quality } = await analyzeVideoLighting(file);
        lightingQuality = quality;
        durationSeconds = dur;
      } catch {
        // Fall back to the single extracted frame if seeking the clip failed.
        lightingQuality = analyzeCanvasLighting(frame.canvas);
      }
    } else {
      lightingQuality = analyzeCanvasLighting(frame.canvas);
    }

    const peoplePresent = faces.length > 0 || personCount > 0;
    const primaryCategory: PrimaryCategory = peoplePresent ? 'human' : 'nonhuman';

    const tier1Tags = [
      { label: primaryCategory === 'human' ? 'HUMAN' : 'NON-HUMAN', confidence: 0.9 },
      ...(mediaKind === 'video' ? [{ label: 'VIDEO', confidence: 1 }] : [])
    ];

    // Lighting is a useful filter tag on video, where it drives bucketing.
    const lightingTag = mediaKind === 'video'
      ? [{ label: lightingQuality.verdict === 'good' ? 'GOOD LIGHTING' : 'BAD LIGHTING', confidence: lightingQuality.score / 100 }]
      : [];

    if (primaryCategory === 'human') {
      const humanDetails = buildHumanDetails(faces, personCount, frame.width, frame.height);
      const moodAnalysis = buildMoodAnalysis(faces, frame.width, frame.height);
      const confidenceScore = faces.length > 0
        ? Math.round((faces.reduce((sum, f) => sum + f.score, 0) / faces.length) * 1000) / 1000
        : 0.7;

      return {
        primaryCategory,
        mediaKind,
        durationSeconds,
        aiConfidenceScore: confidenceScore,
        aiMoodAnalysis: moodAnalysis,
        aiHumanDetails: humanDetails,
        lightingQuality,
        tier1Tags,
        tier2Tags: [{ label: humanDetails.groupType.toUpperCase(), confidence: 0.85 }, ...lightingTag],
        autoOrganizedBucket: buildBucket({
          mediaKind,
          primaryCategory,
          mood: moodAnalysis,
          groupType: humanDetails.groupType,
          lighting: lightingQuality
        }),
        frameWidth: frame.width,
        frameHeight: frame.height,
        source: 'local-model'
      };
    }

    const objectDetails = buildObjectDetails(detections, frame.canvas);
    const topConfidence = detections.filter((d) => d.label !== 'person').reduce((max, d) => Math.max(max, d.confidence), 0);

    return {
      primaryCategory,
      mediaKind,
      durationSeconds,
      aiConfidenceScore: Math.round((topConfidence || 0.6) * 1000) / 1000,
      aiObjectDetails: objectDetails,
      lightingQuality,
      tier1Tags,
      tier2Tags: [{ label: objectDetails.environment.toUpperCase(), confidence: 0.7 }, ...lightingTag],
      autoOrganizedBucket: buildBucket({
        mediaKind,
        primaryCategory,
        environment: objectDetails.environment,
        lighting: lightingQuality
      }),
      frameWidth: frame.width,
      frameHeight: frame.height,
      source: 'local-model'
    };
  } catch (err) {
    return { ...localHeuristicAnalysis(file), source: 'fallback', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Deterministic, no-model fallback classifier. Used only when the real
 * detection pipeline can't run (unsupported file type, model load failure,
 * missing browser capability), so ingestion never fully blocks on it.
 */
function localHeuristicAnalysis(file: File): Omit<AIAnalysisResult, 'source' | 'error'> {
  const name = file.name.toLowerCase();
  const mediaKind: MediaKind = isVideoType(file.type) || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(name) ? 'video' : 'image';
  // No pixels to measure, so record 'not analyzed' rather than inventing a verdict.
  const lightingQuality = unknownLightingQuality();

  const kindTag = mediaKind === 'video' ? [{ label: 'VIDEO', confidence: 1 }] : [];

  // Filename-only classification. Deliberately deterministic — the same file
  // must classify the same way every time, so there's no random guess here.
  // Without any hint we default to non-human, since that's the safer bucket to
  // land in for review.
  const humanHints = ['portrait', 'people', 'bride', 'groom', 'wedding', 'family', 'group', 'selfie', 'face', 'headshot'];
  const isHuman = humanHints.some((h) => name.includes(h));

  if (isHuman) {
    return {
      primaryCategory: 'human',
      mediaKind,
      lightingQuality,
      aiConfidenceScore: 0.6,
      aiMoodAnalysis: {
        primaryMood: 'neutral',
        moodConfidence: 0.5,
        joyScore: 50,
        detectedEmotions: [{ emotion: 'Neutral', confidence: 0.5 }]
      },
      aiHumanDetails: {
        peopleCount: 1,
        groupType: 'solo' as AIHumanDetection['groupType'],
        shotType: 'half_body',
        eyeContact: 'direct',
        eyesClosedDetected: false,
        faces: []
      },
      tier1Tags: [{ label: 'HUMAN', confidence: 0.6 }, ...kindTag],
      tier2Tags: [{ label: 'SOLO', confidence: 0.6 }],
      autoOrganizedBucket: mediaKind === 'video' ? '/Videos/Unsorted' : '/Humans/Unsorted'
    };
  }

  return {
    primaryCategory: 'nonhuman',
    mediaKind,
    lightingQuality,
    aiConfidenceScore: 0.6,
    aiObjectDetails: {
      detectedLabels: ['Unclassified'],
      environment: 'indoor',
      lightingStyle: 'natural_diffused'
    },
    tier1Tags: [{ label: 'NON-HUMAN', confidence: 0.6 }, ...kindTag],
    tier2Tags: [{ label: 'UNSORTED', confidence: 0.6 }],
    autoOrganizedBucket: mediaKind === 'video' ? '/Videos/Unsorted' : '/Non-Human/Unsorted'
  };
}

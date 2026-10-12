/**
 * Phort Type Definitions
 */

export type NavigationTab = 'workspace' | 'library' | 'ingestion' | 'buckets' | 'settings';

/**
 * Bucket tabs. 'nonhuman' replaces the old separate 'objects' and 'environment'
 * buckets (objects, gear, details, landscapes and venues all live here now).
 * 'videos' is a media-kind bucket rather than a subject bucket: it holds every
 * video clip, grouped by lighting quality.
 */
export type BucketCategory = 'humans' | 'nonhuman' | 'videos';

export type HumanFilter = 'all' | 'solo' | 'couples' | 'groups' | 'mood';

/** Subject classification. Everything that isn't a person is 'nonhuman'. */
export type PrimaryCategory = 'human' | 'nonhuman';

/** Whether the asset is a still image or a video clip. */
export type MediaKind = 'image' | 'video';

export type LightingVerdict = 'good' | 'bad';

export interface AIMoodAnalysis {
  primaryMood: 'happy' | 'neutral' | 'serious' | 'candid' | 'emotional' | 'surprised' | 'focused' | 'introspective' | 'energetic' | 'epic';
  moodConfidence: number;
  joyScore: number;
  detectedEmotions: { emotion: string; confidence: number }[];
}

export interface FaceBoundingBox {
  id: string;
  box: [number, number, number, number]; // [top %, left %, width %, height %]
  label: string;
  confidence: number;
}

export interface AIHumanDetection {
  peopleCount: number;
  groupType: 'solo' | 'duo' | 'small_group' | 'crowd';
  shotType: 'macro' | 'portrait_close' | 'half_body' | 'full_body' | 'wide' | 'action';
  eyeContact: 'direct' | 'averted' | 'closed' | 'profile';
  eyesClosedDetected: boolean;
  faces: FaceBoundingBox[];
}

export interface AIObjectDetection {
  detectedLabels: string[];
  environment: 'indoor' | 'outdoor' | 'studio' | 'landscape' | 'urban' | 'aerial';
  lightingStyle: 'golden_hour' | 'natural_diffused' | 'harsh_sun' | 'night' | 'flash' | 'low_key' | 'high_key' | 'neon';
}

/**
 * Objective lighting-quality measurement, used to sort videos into the
 * Good Lighting / Bad Lighting buckets. Unlike `AIObjectDetection.lightingStyle`
 * (which describes the *look* — golden hour, neon, low key), this describes
 * whether the exposure is technically usable.
 */
export interface LightingQuality {
  verdict: LightingVerdict;
  /** 0-100. Higher is better-lit. Values >= 60 are 'good'. */
  score: number;
  /** Mean luma across sampled frames, 0-255. */
  brightness: number;
  /** Std-dev of luma across sampled frames — low values mean flat, muddy footage. */
  contrast: number;
  /** Fraction of pixels crushed to black, 0-1. */
  shadowClipping: number;
  /** Fraction of pixels blown to white, 0-1. */
  highlightClipping: number;
  /** How much exposure drifts between sampled frames, 0-100. High = flickering. */
  exposureVariance: number;
  /** Number of frames sampled across the clip (1 for stills). */
  framesSampled: number;
  /** Human-readable reasons behind the verdict, e.g. 'Underexposed', 'Crushed shadows'. */
  reasons: string[];
}

export interface TechnicalEXIF {
  camera: string;
  lens: string;
  exposure: string;
  iso: number;
  resolution: string;
  colorSpace: string;
  format: 'RAW' | 'JPG' | '4K' | '1080p' | 'NEF' | 'ARW' | 'RAF' | 'CR2' | 'CR3' | 'DNG';
}

export interface MediaAsset {
  id: string;
  projectId: string;
  projectName?: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  capturedAt: string;
  importedAt: string;
  
  /** 'image' or 'video' — videos are routed to the Videos bucket, not the subject buckets. */
  mediaKind: MediaKind;
  /** Clip duration in seconds. Videos only. */
  durationSeconds?: number;

  // AI Classification
  primaryCategory: PrimaryCategory;
  aiConfidenceScore: number;
  aiMoodAnalysis?: AIMoodAnalysis;
  aiHumanDetails?: AIHumanDetection;
  aiObjectDetails?: AIObjectDetection;
  /** Exposure/lighting measurement. Always set for videos; optional for stills. */
  lightingQuality?: LightingQuality;
  
  tier1Tags: { label: string; confidence: number }[];
  tier2Tags: { label: string; confidence: number }[];
  
  autoOrganizedBucket: string;
  routeStatus: 'review_needed' | 'auto_routed' | 'processing' | 'queued';
  
  // Display & Interaction
  aspectRatio: 'square' | 'tall' | 'wide' | 'panoramic';
  thumbnailUrl: string;
  originalUrl: string;
  /**
   * A still frame to show for this asset. Set for videos (a video URL can't be
   * rendered in an <img>), so tiles have a real image instead of a broken one.
   * Stills leave this unset and use thumbnailUrl.
   */
  posterUrl?: string;
  isFavorite?: boolean;
  isSelected?: boolean;
  isEdited?: boolean;
  rating?: number;
}

export interface Project {
  id: string;
  title: string;
  client?: string;
  date: string;
  location: string;
  coverUrl: string;
  assetCount: number;
  videoCount: number;
  status: 'processing' | 'indexed' | 'synced';
  syncProgress?: number;
  faces: string[];
}

export interface LiveIngestionEvent {
  id: string;
  timestamp: string;
  type: 'subject' | 'object' | 'warning' | 'batch' | 'complete';
  message: string;
  target: string;
  subtext?: string;
  confidence?: number;
}

export interface PipelineSettingsState {
  tier1Threshold: number;
  tier2Threshold: number;
  requireHumanReviewForPeople: boolean;
  strictMoodMatching: boolean;
  activeVisionCore: boolean;
  activeSemanticTagging: boolean;
  facialRecognitionEnabled: boolean;
}

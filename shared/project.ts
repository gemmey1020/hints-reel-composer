export const SCHEMA_VERSION = 1 as const;

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";
export type AssetKind = "video" | "audio" | "image";
export type TrackKind = "video" | "audio" | "graphics";
export type ClipKind = "media" | "text" | "shape" | "brand-motion";
export type FitMode = "cover" | "contain";
export type RenderPreset = "draft" | "review" | "delivery" | "archive" | "webm" | "gif" | "webp" | "png";
export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface Keyframe {
  id: string;
  frame: number;
  value: number;
  easing: Easing;
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  fit: FitMode;
}

export interface TextStyle {
  fontFamily: "Bomstad Display" | "Hakira" | "Tajawal";
  fontWeight: 400 | 500 | 600 | 700 | 800;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  align: "left" | "center" | "right";
  direction: "ltr" | "rtl";
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: AssetKind;
  fileName: string;
  hash: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  audioSampleRate?: number;
  createdAt: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  waveformUrl?: string;
  provenance?: string;
}

export interface ReelClip {
  id: string;
  trackId: string;
  kind: ClipKind;
  name: string;
  assetId?: string;
  timelineStart: number;
  duration: number;
  sourceIn: number;
  playbackRate: number;
  enabled: boolean;
  transform: Transform;
  text?: string;
  textStyle?: TextStyle;
  shape?: {
    type: "line" | "rectangle";
    color: string;
    width: number;
    height: number;
  };
  audioGain: number;
  fadeIn: number;
  fadeOut: number;
  keyframes: Record<string, Keyframe[]>;
}

export interface ReelTrack {
  id: string;
  name: string;
  kind: TrackKind;
  order: number;
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  solo: boolean;
  clips: ReelClip[];
}

export interface ReelSequence {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  tracks: ReelTrack[];
}

export interface RenderSettings {
  preset: RenderPreset;
  normalizeAudio: boolean;
  loudnessTarget: number;
  truePeak: number;
}

export interface ReelProject {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeSequenceId: string;
  assets: MediaAsset[];
  sequences: ReelSequence[];
  renderSettings: RenderSettings;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const RATIO_PRESETS: Record<AspectRatio, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 }
};

function makeTracks(): ReelTrack[] {
  return [
    { id: crypto.randomUUID(), name: "Text / Graphics", kind: "graphics", order: 30, locked: false, hidden: false, muted: false, solo: false, clips: [] },
    { id: crypto.randomUUID(), name: "Signals / Overlays", kind: "graphics", order: 20, locked: false, hidden: false, muted: false, solo: false, clips: [] },
    { id: crypto.randomUUID(), name: "Primary Video", kind: "video", order: 10, locked: false, hidden: false, muted: false, solo: false, clips: [] },
    { id: crypto.randomUUID(), name: "Narration", kind: "audio", order: 10, locked: false, hidden: false, muted: false, solo: false, clips: [] },
    { id: crypto.randomUUID(), name: "Sound Design", kind: "audio", order: 20, locked: false, hidden: false, muted: false, solo: false, clips: [] }
  ];
}

function makeSequence(aspectRatio: AspectRatio): ReelSequence {
  const dimensions = RATIO_PRESETS[aspectRatio];
  return {
    id: crypto.randomUUID(),
    name: `${aspectRatio} Sequence`,
    aspectRatio,
    width: dimensions.width,
    height: dimensions.height,
    fps: 30,
    duration: 20,
    background: "#04080c",
    tracks: makeTracks()
  };
}

export function createDefaultProject(title = "Untitled Reel"): ReelProject {
  const now = new Date().toISOString();
  const sequences = (["9:16", "16:9", "1:1", "4:5"] as AspectRatio[]).map(makeSequence);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    activeSequenceId: sequences[0].id,
    assets: [],
    sequences,
    renderSettings: {
      preset: "review",
      normalizeAudio: true,
      loudnessTarget: -16,
      truePeak: -1.5
    }
  };
}

export function createMediaClip(asset: MediaAsset, trackId: string, timelineStart: number): ReelClip {
  const fallbackDuration = asset.kind === "image" ? 4 : asset.duration || 4;
  return {
    id: crypto.randomUUID(),
    trackId,
    kind: "media",
    name: asset.name,
    assetId: asset.id,
    timelineStart,
    duration: Math.max(0.1, fallbackDuration),
    sourceIn: 0,
    playbackRate: 1,
    enabled: true,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: "cover" },
    audioGain: 1,
    fadeIn: 0,
    fadeOut: 0,
    keyframes: {}
  };
}

export function createTextClip(trackId: string, timelineStart: number, duration = 4): ReelClip {
  return {
    id: crypto.randomUUID(),
    trackId,
    kind: "text",
    name: "Text",
    timelineStart,
    duration,
    sourceIn: 0,
    playbackRate: 1,
    enabled: true,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: "contain" },
    text: "CLARITY BEGINS WITH ONE SIGNAL.",
    textStyle: {
      fontFamily: "Bomstad Display",
      fontWeight: 700,
      fontSize: 62,
      lineHeight: 1.1,
      letterSpacing: 1.4,
      color: "#ffffff",
      align: "center",
      direction: "ltr",
      strokeColor: "#04080c",
      strokeWidth: 2,
      shadowColor: "#04080c",
      shadowBlur: 12
    },
    audioGain: 1,
    fadeIn: 0.2,
    fadeOut: 0.2,
    keyframes: {}
  };
}

export function validateProject(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return { valid: false, errors: ["Recipe must be a JSON object."] };
  const project = input as Partial<ReelProject>;
  if (project.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}.`);
  if (!project.id || typeof project.id !== "string") errors.push("Project id is required.");
  if (!project.title || typeof project.title !== "string") errors.push("Project title is required.");
  if (!Array.isArray(project.assets)) errors.push("assets must be an array.");
  if (!Array.isArray(project.sequences) || project.sequences.length === 0) errors.push("At least one sequence is required.");
  for (const [sequenceIndex, sequence] of (project.sequences || []).entries()) {
    if (!sequence.id) errors.push(`sequences[${sequenceIndex}].id is required.`);
    if (!Number.isFinite(sequence.width) || sequence.width <= 0) errors.push(`sequences[${sequenceIndex}].width must be positive.`);
    if (!Number.isFinite(sequence.height) || sequence.height <= 0) errors.push(`sequences[${sequenceIndex}].height must be positive.`);
    if (!Number.isFinite(sequence.fps) || sequence.fps <= 0) errors.push(`sequences[${sequenceIndex}].fps must be positive.`);
    if (!Number.isFinite(sequence.duration) || sequence.duration <= 0) errors.push(`sequences[${sequenceIndex}].duration must be positive.`);
    if (!Array.isArray(sequence.tracks)) errors.push(`sequences[${sequenceIndex}].tracks must be an array.`);
    for (const [trackIndex, track] of (sequence.tracks || []).entries()) {
      if (!Array.isArray(track.clips)) errors.push(`sequences[${sequenceIndex}].tracks[${trackIndex}].clips must be an array.`);
      for (const [clipIndex, clip] of (track.clips || []).entries()) {
        if (!Number.isFinite(clip.timelineStart) || clip.timelineStart < 0) errors.push(`Clip ${clipIndex} has an invalid timelineStart.`);
        if (!Number.isFinite(clip.duration) || clip.duration <= 0) errors.push(`Clip ${clipIndex} has an invalid duration.`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function getActiveSequence(project: ReelProject): ReelSequence {
  return project.sequences.find((sequence) => sequence.id === project.activeSequenceId) || project.sequences[0];
}

export function findClip(project: ReelProject, clipId: string): { sequence: ReelSequence; track: ReelTrack; clip: ReelClip } | null {
  for (const sequence of project.sequences) {
    for (const track of sequence.tracks) {
      const clip = track.clips.find((candidate) => candidate.id === clipId);
      if (clip) return { sequence, track, clip };
    }
  }
  return null;
}

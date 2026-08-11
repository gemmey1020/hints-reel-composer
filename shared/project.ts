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

const ASPECT_RATIOS = new Set<AspectRatio>(["9:16", "16:9", "1:1", "4:5"]);
const ASSET_KINDS = new Set<AssetKind>(["video", "audio", "image"]);
const TRACK_KINDS = new Set<TrackKind>(["video", "audio", "graphics"]);
const CLIP_KINDS = new Set<ClipKind>(["media", "text", "shape", "brand-motion"]);
const RENDER_PRESETS = new Set<RenderPreset>(["draft", "review", "delivery", "archive", "webm", "gif", "webp", "png"]);
const EASINGS = new Set<Easing>(["linear", "ease-in", "ease-out", "ease-in-out"]);
const KEYFRAME_PROPERTIES = new Set(["x", "y", "scale", "rotation", "opacity"]);
const FONT_FAMILIES = new Set(["Bomstad Display", "Hakira", "Tajawal"]);
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,127}$/;
const SAFE_CHILD_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const SAFE_FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,190}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const COLOR = /^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknownKeys(value: UnknownRecord, allowed: readonly string[], path: string, errors: string[]): void {
  const supported = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!supported.has(key)) errors.push(`${path}.${key} is not supported.`);
  }
}

function requireString(value: unknown, path: string, errors: string[], minimum = 1, maximum = 200): value is string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    errors.push(`${path} must be a string between ${minimum} and ${maximum} characters.`);
    return false;
  }
  return true;
}

function requireFinite(value: unknown, path: string, errors: string[], minimum: number, maximum: number, integer = false): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    errors.push(`${path} must be a finite ${integer ? "integer " : ""}number between ${minimum} and ${maximum}.`);
    return false;
  }
  return true;
}

function requireBoolean(value: unknown, path: string, errors: string[]): value is boolean {
  if (typeof value !== "boolean") {
    errors.push(`${path} must be a boolean.`);
    return false;
  }
  return true;
}

function requireEnum<T extends string>(value: unknown, values: Set<T>, path: string, errors: string[]): value is T {
  if (typeof value !== "string" || !values.has(value as T)) {
    errors.push(`${path} is unsupported.`);
    return false;
  }
  return true;
}

function requireTimestamp(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) errors.push(`${path} must be a valid timestamp.`);
}

function requireColor(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "string" || !COLOR.test(value)) errors.push(`${path} must be a #RRGGBB or #RRGGBBAA color.`);
}

function validateTransform(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  rejectUnknownKeys(value, ["x", "y", "scale", "rotation", "opacity", "fit"], path, errors);
  requireFinite(value.x, `${path}.x`, errors, -100000, 100000);
  requireFinite(value.y, `${path}.y`, errors, -100000, 100000);
  requireFinite(value.scale, `${path}.scale`, errors, 0.05, 8);
  requireFinite(value.rotation, `${path}.rotation`, errors, -36000, 36000);
  requireFinite(value.opacity, `${path}.opacity`, errors, 0, 1);
  requireEnum(value.fit, new Set<FitMode>(["cover", "contain"]), `${path}.fit`, errors);
}

function validateTextStyle(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} is required and must be an object.`);
    return;
  }
  rejectUnknownKeys(value, [
    "fontFamily", "fontWeight", "fontSize", "lineHeight", "letterSpacing", "color", "align", "direction",
    "strokeColor", "strokeWidth", "shadowColor", "shadowBlur"
  ], path, errors);
  requireEnum(value.fontFamily, FONT_FAMILIES, `${path}.fontFamily`, errors);
  if (![400, 500, 600, 700, 800].includes(value.fontWeight as number)) errors.push(`${path}.fontWeight is unsupported.`);
  requireFinite(value.fontSize, `${path}.fontSize`, errors, 8, 400);
  requireFinite(value.lineHeight, `${path}.lineHeight`, errors, 0.5, 4);
  requireFinite(value.letterSpacing, `${path}.letterSpacing`, errors, -20, 100);
  requireColor(value.color, `${path}.color`, errors);
  requireEnum(value.align, new Set(["left", "center", "right"]), `${path}.align`, errors);
  requireEnum(value.direction, new Set(["ltr", "rtl"]), `${path}.direction`, errors);
  requireColor(value.strokeColor, `${path}.strokeColor`, errors);
  requireFinite(value.strokeWidth, `${path}.strokeWidth`, errors, 0, 50);
  requireColor(value.shadowColor, `${path}.shadowColor`, errors);
  requireFinite(value.shadowBlur, `${path}.shadowBlur`, errors, 0, 200);
}

function validateShape(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} is required and must be an object.`);
    return;
  }
  rejectUnknownKeys(value, ["type", "color", "width", "height"], path, errors);
  requireEnum(value.type, new Set(["line", "rectangle"]), `${path}.type`, errors);
  requireColor(value.color, `${path}.color`, errors);
  requireFinite(value.width, `${path}.width`, errors, 1, 20000);
  requireFinite(value.height, `${path}.height`, errors, 1, 20000);
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
  if (!isRecord(input)) return { valid: false, errors: ["Recipe must be a JSON object."] };
  const project = input;
  rejectUnknownKeys(project, [
    "schemaVersion", "id", "title", "createdAt", "updatedAt", "activeSequenceId", "assets", "sequences", "renderSettings"
  ], "project", errors);
  if (project.schemaVersion !== SCHEMA_VERSION) errors.push(`project.schemaVersion must be ${SCHEMA_VERSION}.`);
  const projectIdValid = requireString(project.id, "project.id", errors, 3, 128) && SAFE_ID.test(project.id as string);
  if (typeof project.id === "string" && !SAFE_ID.test(project.id)) errors.push("project.id must be a safe managed id.");
  requireString(project.title, "project.title", errors, 1, 160);
  requireTimestamp(project.createdAt, "project.createdAt", errors);
  requireTimestamp(project.updatedAt, "project.updatedAt", errors);
  const projectId = projectIdValid ? project.id as string : "invalid-project";

  const assetIds = new Set<string>();
  const assets = new Map<string, UnknownRecord>();
  if (!Array.isArray(project.assets)) {
    errors.push("project.assets must be an array.");
  } else {
    for (const [index, rawAsset] of project.assets.entries()) {
      const path = `assets[${index}]`;
      if (!isRecord(rawAsset)) {
        errors.push(`${path} must be an object.`);
        continue;
      }
      rejectUnknownKeys(rawAsset, [
        "id", "name", "kind", "fileName", "hash", "duration", "width", "height", "fps", "hasAudio",
        "audioSampleRate", "createdAt", "mediaUrl", "thumbnailUrl", "waveformUrl", "provenance"
      ], path, errors);
      const idValid = requireString(rawAsset.id, `${path}.id`, errors, 1, 128) && SAFE_CHILD_ID.test(rawAsset.id as string);
      if (typeof rawAsset.id === "string" && !SAFE_CHILD_ID.test(rawAsset.id)) errors.push(`${path}.id must be a safe managed id.`);
      if (idValid) {
        const id = rawAsset.id as string;
        if (assetIds.has(id)) errors.push(`${path} has a duplicate asset id ${id}.`);
        assetIds.add(id);
        assets.set(id, rawAsset);
      }
      requireString(rawAsset.name, `${path}.name`, errors, 1, 200);
      const kindValid = requireEnum(rawAsset.kind, ASSET_KINDS, `${path}.kind`, errors);
      if (typeof rawAsset.fileName !== "string" || !SAFE_FILE_NAME.test(rawAsset.fileName) || rawAsset.fileName.includes("..")) {
        errors.push(`${path}.fileName must be a safe managed file name.`);
      }
      if (typeof rawAsset.hash !== "string" || !SHA256.test(rawAsset.hash)) errors.push(`${path}.hash must be a lowercase SHA-256 value.`);
      requireFinite(rawAsset.duration, `${path}.duration`, errors, kindValid && rawAsset.kind === "image" ? 0.01 : 0.001, 21600);
      const widthValid = requireFinite(rawAsset.width, `${path}.width`, errors, 0, 32768, true);
      const heightValid = requireFinite(rawAsset.height, `${path}.height`, errors, 0, 32768, true);
      const fpsValid = requireFinite(rawAsset.fps, `${path}.fps`, errors, 0, 240);
      if (kindValid && rawAsset.kind !== "audio" && widthValid && rawAsset.width === 0) errors.push(`${path}.width must be positive for visual media.`);
      if (kindValid && rawAsset.kind !== "audio" && heightValid && rawAsset.height === 0) errors.push(`${path}.height must be positive for visual media.`);
      if (kindValid && rawAsset.kind === "video" && fpsValid && rawAsset.fps === 0) errors.push(`${path}.fps must be positive for video.`);
      requireBoolean(rawAsset.hasAudio, `${path}.hasAudio`, errors);
      if (rawAsset.audioSampleRate !== undefined) requireFinite(rawAsset.audioSampleRate, `${path}.audioSampleRate`, errors, 8000, 384000, true);
      requireTimestamp(rawAsset.createdAt, `${path}.createdAt`, errors);
      if (idValid) {
        const expectedUrl = `/api/v1/projects/${projectId}/assets/${rawAsset.id as string}`;
        if (rawAsset.mediaUrl !== expectedUrl) errors.push(`${path}.mediaUrl must reference its managed project asset endpoint.`);
      }
      for (const optionalUrl of ["thumbnailUrl", "waveformUrl"] as const) {
        if (rawAsset[optionalUrl] !== undefined && (typeof rawAsset[optionalUrl] !== "string" || !(rawAsset[optionalUrl] as string).startsWith(`/api/v1/projects/${projectId}/artifacts/`))) {
          errors.push(`${path}.${optionalUrl} must be a managed project artifact URL.`);
        }
      }
      if (rawAsset.provenance !== undefined) requireString(rawAsset.provenance, `${path}.provenance`, errors, 1, 500);
    }
  }

  const sequenceIds = new Set<string>();
  const trackIds = new Set<string>();
  const clipIds = new Set<string>();
  const keyframeIds = new Set<string>();
  if (!Array.isArray(project.sequences) || project.sequences.length === 0) {
    errors.push("project.sequences must contain at least one sequence.");
  } else {
    for (const [sequenceIndex, rawSequence] of project.sequences.entries()) {
      const sequencePath = `sequences[${sequenceIndex}]`;
      if (!isRecord(rawSequence)) {
        errors.push(`${sequencePath} must be an object.`);
        continue;
      }
      rejectUnknownKeys(rawSequence, ["id", "name", "aspectRatio", "width", "height", "fps", "duration", "background", "tracks"], sequencePath, errors);
      const sequenceIdValid = requireString(rawSequence.id, `${sequencePath}.id`, errors, 1, 128) && SAFE_CHILD_ID.test(rawSequence.id as string);
      if (sequenceIdValid) {
        const id = rawSequence.id as string;
        if (sequenceIds.has(id)) errors.push(`${sequencePath} has a duplicate sequence id ${id}.`);
        sequenceIds.add(id);
      }
      requireString(rawSequence.name, `${sequencePath}.name`, errors, 1, 160);
      const ratioValid = requireEnum(rawSequence.aspectRatio, ASPECT_RATIOS, `${sequencePath}.aspectRatio`, errors);
      const widthValid = requireFinite(rawSequence.width, `${sequencePath}.width`, errors, 16, 16384, true);
      const heightValid = requireFinite(rawSequence.height, `${sequencePath}.height`, errors, 16, 16384, true);
      if (ratioValid) {
        const [ratioWidth, ratioHeight] = (rawSequence.aspectRatio as string).split(":").map(Number);
        if (widthValid && heightValid && (rawSequence.width as number) * ratioHeight !== (rawSequence.height as number) * ratioWidth) {
          errors.push(`${sequencePath}.width and height must match the declared ${rawSequence.aspectRatio} aspect ratio.`);
        }
      }
      const fpsValid = requireFinite(rawSequence.fps, `${sequencePath}.fps`, errors, 1, 120);
      const durationValid = requireFinite(rawSequence.duration, `${sequencePath}.duration`, errors, 1 / 120, 21600);
      requireColor(rawSequence.background, `${sequencePath}.background`, errors);
      if (!Array.isArray(rawSequence.tracks) || rawSequence.tracks.length === 0) {
        errors.push(`${sequencePath}.tracks must contain at least one track.`);
        continue;
      }
      for (const [trackIndex, rawTrack] of rawSequence.tracks.entries()) {
        const trackPath = `${sequencePath}.tracks[${trackIndex}]`;
        if (!isRecord(rawTrack)) {
          errors.push(`${trackPath} must be an object.`);
          continue;
        }
        rejectUnknownKeys(rawTrack, ["id", "name", "kind", "order", "locked", "hidden", "muted", "solo", "clips"], trackPath, errors);
        const trackIdValid = requireString(rawTrack.id, `${trackPath}.id`, errors, 1, 128) && SAFE_CHILD_ID.test(rawTrack.id as string);
        if (trackIdValid) {
          const id = rawTrack.id as string;
          if (trackIds.has(id)) errors.push(`${trackPath} has a duplicate track id ${id}.`);
          trackIds.add(id);
        }
        requireString(rawTrack.name, `${trackPath}.name`, errors, 1, 160);
        const trackKindValid = requireEnum(rawTrack.kind, TRACK_KINDS, `${trackPath}.kind`, errors);
        requireFinite(rawTrack.order, `${trackPath}.order`, errors, -10000, 10000, true);
        requireBoolean(rawTrack.locked, `${trackPath}.locked`, errors);
        requireBoolean(rawTrack.hidden, `${trackPath}.hidden`, errors);
        requireBoolean(rawTrack.muted, `${trackPath}.muted`, errors);
        requireBoolean(rawTrack.solo, `${trackPath}.solo`, errors);
        if (!Array.isArray(rawTrack.clips)) {
          errors.push(`${trackPath}.clips must be an array.`);
          continue;
        }
        for (const [clipIndex, rawClip] of rawTrack.clips.entries()) {
          const clipPath = `${trackPath}.clips[${clipIndex}]`;
          if (!isRecord(rawClip)) {
            errors.push(`${clipPath} must be an object.`);
            continue;
          }
          rejectUnknownKeys(rawClip, [
            "id", "trackId", "kind", "name", "assetId", "timelineStart", "duration", "sourceIn", "playbackRate", "enabled",
            "transform", "text", "textStyle", "shape", "audioGain", "fadeIn", "fadeOut", "keyframes"
          ], clipPath, errors);
          const clipIdValid = requireString(rawClip.id, `${clipPath}.id`, errors, 1, 128) && SAFE_CHILD_ID.test(rawClip.id as string);
          if (clipIdValid) {
            const id = rawClip.id as string;
            if (clipIds.has(id)) errors.push(`${clipPath} has a duplicate clip id ${id}.`);
            clipIds.add(id);
          }
          if (rawClip.trackId !== rawTrack.id) errors.push(`${clipPath}.trackId must match its containing track.`);
          const clipKindValid = requireEnum(rawClip.kind, CLIP_KINDS, `${clipPath}.kind`, errors);
          requireString(rawClip.name, `${clipPath}.name`, errors, 1, 200);
          const timelineValid = requireFinite(rawClip.timelineStart, `${clipPath}.timelineStart`, errors, 0, 21600);
          const clipDurationValid = requireFinite(rawClip.duration, `${clipPath}.duration`, errors, 1 / 120, 21600);
          requireFinite(rawClip.sourceIn, `${clipPath}.sourceIn`, errors, 0, 21600);
          requireFinite(rawClip.playbackRate, `${clipPath}.playbackRate`, errors, 0.05, 8);
          requireBoolean(rawClip.enabled, `${clipPath}.enabled`, errors);
          validateTransform(rawClip.transform, `${clipPath}.transform`, errors);
          requireFinite(rawClip.audioGain, `${clipPath}.audioGain`, errors, 0, 4);
          const fadeInValid = requireFinite(rawClip.fadeIn, `${clipPath}.fadeIn`, errors, 0, 21600);
          const fadeOutValid = requireFinite(rawClip.fadeOut, `${clipPath}.fadeOut`, errors, 0, 21600);
          if (clipDurationValid && fadeInValid && fadeOutValid && (rawClip.fadeIn as number) + (rawClip.fadeOut as number) > (rawClip.duration as number) + 1e-9) {
            errors.push(`${clipPath}.fadeIn + fadeOut cannot exceed clip duration.`);
          }
          if (durationValid && timelineValid && clipDurationValid && (rawClip.timelineStart as number) + (rawClip.duration as number) > (rawSequence.duration as number) + 1e-9) {
            errors.push(`${clipPath} exceeds sequence duration.`);
          }

          if (clipKindValid && rawClip.kind === "media") {
            if (typeof rawClip.assetId !== "string" || !assets.has(rawClip.assetId)) {
              errors.push(`${clipPath}.assetId does not resolve to a managed asset.`);
            } else {
              const asset = assets.get(rawClip.assetId)!;
              if (trackKindValid && asset.kind === "audio" && rawTrack.kind !== "audio") errors.push(`${clipPath} audio media must be on an audio track.`);
              if (trackKindValid && asset.kind !== "audio" && rawTrack.kind !== "video") errors.push(`${clipPath} visual media must be on a video track.`);
              if (asset.kind !== "image" && typeof rawClip.sourceIn === "number" && typeof asset.duration === "number" && rawClip.sourceIn >= asset.duration) {
                errors.push(`${clipPath}.sourceIn must be before the managed asset duration.`);
              }
            }
          }
          if (clipKindValid && (rawClip.kind === "text" || rawClip.kind === "shape" || rawClip.kind === "brand-motion") && trackKindValid && rawTrack.kind !== "graphics") {
            errors.push(`${clipPath} graphics clips must be on a graphics track.`);
          }
          if (clipKindValid && rawClip.kind === "text") {
            requireString(rawClip.text, `${clipPath}.text`, errors, 0, 20000);
            validateTextStyle(rawClip.textStyle, `${clipPath}.textStyle`, errors);
          }
          if (clipKindValid && rawClip.kind === "shape") validateShape(rawClip.shape, `${clipPath}.shape`, errors);

          if (!isRecord(rawClip.keyframes)) {
            errors.push(`${clipPath}.keyframes must be an object.`);
          } else {
            for (const property of Object.keys(rawClip.keyframes)) {
              const propertyPath = `${clipPath}.keyframes.${property}`;
              if (!KEYFRAME_PROPERTIES.has(property)) {
                errors.push(`${propertyPath} is not supported.`);
                continue;
              }
              const listValue: unknown = rawClip.keyframes[property];
              if (!Array.isArray(listValue)) {
                errors.push(`${propertyPath} must be an array.`);
                continue;
              }
              const keyframeList = listValue as unknown[];
              let previousFrame = -1;
              const frames = new Set<number>();
              for (const [keyframeIndex, rawKeyframe] of keyframeList.entries()) {
                const keyframePath = `${propertyPath}[${keyframeIndex}]`;
                if (!isRecord(rawKeyframe)) {
                  errors.push(`${keyframePath} must be an object.`);
                  continue;
                }
                rejectUnknownKeys(rawKeyframe, ["id", "frame", "value", "easing"], keyframePath, errors);
                const keyframeIdValid = requireString(rawKeyframe.id, `${keyframePath}.id`, errors, 1, 128) && SAFE_CHILD_ID.test(rawKeyframe.id as string);
                if (keyframeIdValid) {
                  const id = rawKeyframe.id as string;
                  if (keyframeIds.has(id)) errors.push(`${keyframePath} has a duplicate keyframe id ${id}.`);
                  keyframeIds.add(id);
                }
                const maxFrame = fpsValid && clipDurationValid ? Math.ceil((rawClip.duration as number) * (rawSequence.fps as number)) : 2_592_000;
                const frameValid = requireFinite(rawKeyframe.frame, `${keyframePath}.frame`, errors, 0, maxFrame, true);
                if (frameValid) {
                  const frame = rawKeyframe.frame as number;
                  if (frames.has(frame)) errors.push(`${propertyPath} has a duplicate frame ${frame}.`);
                  if (frame < previousFrame) errors.push(`${propertyPath} must use deterministic frame order.`);
                  frames.add(frame);
                  previousFrame = frame;
                }
                const ranges: Record<string, [number, number]> = {
                  x: [-100000, 100000], y: [-100000, 100000], scale: [0.05, 8], rotation: [-36000, 36000], opacity: [0, 1]
                };
                requireFinite(rawKeyframe.value, `${keyframePath}.value`, errors, ranges[property][0], ranges[property][1]);
                requireEnum(rawKeyframe.easing, EASINGS, `${keyframePath}.easing`, errors);
              }
            }
          }
        }
      }
    }
  }

  if (typeof project.activeSequenceId !== "string" || !sequenceIds.has(project.activeSequenceId)) {
    errors.push("project.activeSequenceId must resolve to a sequence.");
  }
  if (!isRecord(project.renderSettings)) {
    errors.push("project.renderSettings must be an object.");
  } else {
    rejectUnknownKeys(project.renderSettings, ["preset", "normalizeAudio", "loudnessTarget", "truePeak"], "renderSettings", errors);
    requireEnum(project.renderSettings.preset, RENDER_PRESETS, "renderSettings.preset", errors);
    requireBoolean(project.renderSettings.normalizeAudio, "renderSettings.normalizeAudio", errors);
    requireFinite(project.renderSettings.loudnessTarget, "renderSettings.loudnessTarget", errors, -30, -5);
    requireFinite(project.renderSettings.truePeak, "renderSettings.truePeak", errors, -9, 0);
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

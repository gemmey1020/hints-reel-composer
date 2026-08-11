import type { Keyframe, ReelClip, ReelProject, ReelSequence } from "../../shared/project.ts";

export function cloneProject(project: ReelProject): ReelProject {
  return structuredClone(project);
}

export function formatTimecode(seconds: number, fps = 30): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const frames = Math.floor((safe - Math.floor(safe)) * fps + 0.0001);
  const parts = [minutes, wholeSeconds, frames].map((part) => String(part).padStart(2, "0"));
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${parts.join(":")}` : parts.join(":");
}

export function activeSequence(project: ReelProject): ReelSequence {
  return project.sequences.find((sequence) => sequence.id === project.activeSequenceId) || project.sequences[0];
}

export function getClip(project: ReelProject, clipId: string | null): ReelClip | null {
  if (!clipId) return null;
  for (const sequence of project.sequences) {
    for (const track of sequence.tracks) {
      const clip = track.clips.find((candidate) => candidate.id === clipId);
      if (clip) return clip;
    }
  }
  return null;
}

export function mutateClipIfUnlocked(project: ReelProject, clipId: string, updater: (clip: ReelClip) => void): boolean {
  for (const sequence of project.sequences) {
    for (const track of sequence.tracks) {
      const clip = track.clips.find((candidate) => candidate.id === clipId);
      if (!clip) continue;
      if (track.locked) return false;
      updater(clip);
      return true;
    }
  }
  return false;
}

export function snapTime(value: number, sequence: ReelSequence, excludedClipId?: string): number {
  const frame = 1 / sequence.fps;
  const frameSnapped = Math.round(value / frame) * frame;
  const candidates = [0, sequence.duration];
  for (const track of sequence.tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludedClipId) continue;
      candidates.push(clip.timelineStart, clip.timelineStart + clip.duration);
    }
  }
  const nearest = candidates.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best, frameSnapped);
  return Math.abs(nearest - value) <= 0.12 ? nearest : frameSnapped;
}

function ease(progress: number, easing: Keyframe["easing"]): number {
  if (easing === "ease-in") return progress * progress;
  if (easing === "ease-out") return 1 - (1 - progress) * (1 - progress);
  if (easing === "ease-in-out") return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  return progress;
}

export function keyframedValue(clip: ReelClip, property: string, localTime: number, fallback: number, fps: number): number {
  const keyframes = [...(clip.keyframes[property] || [])].sort((a, b) => a.frame - b.frame);
  if (keyframes.length === 0) return fallback;
  const frame = localTime * fps;
  if (frame <= keyframes[0].frame) return keyframes[0].value;
  if (frame >= keyframes[keyframes.length - 1].frame) return keyframes[keyframes.length - 1].value;
  const rightIndex = keyframes.findIndex((keyframe) => keyframe.frame >= frame);
  const left = keyframes[rightIndex - 1];
  const right = keyframes[rightIndex];
  const progress = (frame - left.frame) / Math.max(1, right.frame - left.frame);
  return left.value + (right.value - left.value) * ease(progress, right.easing);
}

export function clipOpacityAtTime(clip: ReelClip, localTime: number, fps: number): number {
  const opacity = keyframedValue(clip, "opacity", localTime, clip.transform.opacity, fps);
  const fadeIn = Math.max(0, Math.min(clip.fadeIn, clip.duration / 2));
  const fadeOut = Math.max(0, Math.min(clip.fadeOut, clip.duration / 2));
  let fade = 1;
  if (fadeIn > 0 && localTime < fadeIn) fade = Math.max(0, localTime / fadeIn);
  if (fadeOut > 0 && localTime > clip.duration - fadeOut) fade = Math.min(fade, Math.max(0, (clip.duration - localTime) / fadeOut));
  return Math.max(0, Math.min(1, opacity * fade));
}

export function previewTextFontSize(fontSize: number, sequenceHeight: number, stageScale: number): number {
  return fontSize * (sequenceHeight / 1920) * stageScale;
}

export function downloadJson(project: ReelProject): void {
  const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "hints-reel"}.hints-reel.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

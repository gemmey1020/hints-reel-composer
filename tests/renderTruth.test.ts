import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createDefaultProject,
  createMediaClip,
  createTextClip,
  isTrackActive,
  validateProject,
  type MediaAsset
} from "../shared/project.ts";
import { compileRender } from "../server/renderCompiler.ts";
import { qaSamplePlan, RenderPipelineError } from "../server/renderJobs.ts";
import { mutateClipIfUnlocked } from "../src/lib/editor.ts";

function mediaAsset(projectId: string, kind: "video" | "audio" = "video"): MediaAsset {
  const id = crypto.randomUUID();
  return {
    id,
    name: "Truth fixture",
    kind,
    role: kind === "video" ? "official-brand-motion" : "source-media",
    fileName: `${id}-truth.${kind === "video" ? "mp4" : "wav"}`,
    hash: "c".repeat(64),
    duration: 4,
    width: kind === "video" ? 1080 : 0,
    height: kind === "video" ? 1920 : 0,
    fps: kind === "video" ? 30 : 0,
    hasAudio: true,
    audioSampleRate: 48000,
    createdAt: new Date().toISOString(),
    mediaUrl: `/api/v1/projects/${projectId}/assets/${id}`
  };
}

describe("render truth and brand boundary", () => {
  it("accepts official identity only as ordinary managed media metadata", () => {
    const project = createDefaultProject("Official motion boundary");
    const asset = mediaAsset(project.id);
    project.assets.push(asset);
    const track = project.sequences[0].tracks.find((candidate) => candidate.kind === "video")!;
    track.clips.push(createMediaClip(asset, track.id, 0));
    expect(validateProject(project)).toEqual({ valid: true, errors: [] });
    const fakeSpecialClip = structuredClone(project) as unknown as { sequences: Array<{ tracks: Array<{ clips: Array<Record<string, unknown>> }> }> };
    fakeSpecialClip.sequences[0].tracks[0].clips.push({ ...fakeSpecialClip.sequences[0].tracks[0].clips[0], id: crypto.randomUUID(), kind: "brand-motion" });
    expect(validateProject(fakeSpecialClip).errors.join("\n")).toContain("kind is unsupported");
  });

  it("makes normalizeAudio control the final filter graph", () => {
    const project = createDefaultProject("Normalization truth");
    const asset = mediaAsset(project.id, "audio");
    project.assets.push(asset);
    const track = project.sequences[0].tracks.find((candidate) => candidate.kind === "audio")!;
    track.clips.push(createMediaClip(asset, track.id, 0));
    const normalized = compileRender(project, project.sequences[0], "review", "normalized");
    expect(normalized.filterGraph).toContain("loudnorm=I=-16");
    project.renderSettings.normalizeAudio = false;
    const untouched = compileRender(project, project.sequences[0], "review", "untouched");
    expect(untouched.filterGraph).not.toContain("loudnorm=");
    expect(untouched.filterGraph).toContain("amix=");
  });

  it("uses one hidden, mute, and solo contract for visual and audio channels", () => {
    const sequence = createDefaultProject("Track semantics").sequences[0];
    const graphics = sequence.tracks.find((track) => track.kind === "graphics")!;
    const video = sequence.tracks.find((track) => track.kind === "video")!;
    const audio = sequence.tracks.find((track) => track.kind === "audio")!;
    expect(isTrackActive(sequence, video, "visual")).toBe(true);
    expect(isTrackActive(sequence, video, "audio")).toBe(true);
    video.muted = true;
    expect(isTrackActive(sequence, video, "visual")).toBe(true);
    expect(isTrackActive(sequence, video, "audio")).toBe(false);
    video.muted = false;
    video.hidden = true;
    expect(isTrackActive(sequence, video, "visual")).toBe(false);
    expect(isTrackActive(sequence, video, "audio")).toBe(false);
    video.hidden = false;
    graphics.solo = true;
    expect(isTrackActive(sequence, graphics, "visual")).toBe(true);
    expect(isTrackActive(sequence, video, "visual")).toBe(false);
    expect(isTrackActive(sequence, audio, "audio")).toBe(false);
  });

  it("enforces track locks through central mutation logic", () => {
    const project = createDefaultProject("Lock truth");
    const track = project.sequences[0].tracks[0];
    const clip = createTextClip(track.id, 0, 2);
    track.clips.push(clip);
    track.locked = true;
    expect(mutateClipIfUnlocked(project, clip.id, (target) => { target.transform.x = 900; })).toBe(false);
    expect(clip.transform.x).toBe(0);
    track.locked = false;
    expect(mutateClipIfUnlocked(project, clip.id, (target) => { target.transform.x = 120; })).toBe(true);
    expect(clip.transform.x).toBe(120);
  });

  it("compiles visual media fades instead of preview-only fades", () => {
    const project = createDefaultProject("Fade truth");
    const asset = mediaAsset(project.id);
    project.assets.push(asset);
    const track = project.sequences[0].tracks.find((candidate) => candidate.kind === "video")!;
    const clip = createMediaClip(asset, track.id, 1);
    clip.duration = 3;
    clip.fadeIn = 0.5;
    clip.fadeOut = 0.75;
    track.clips.push(clip);
    const result = compileRender(project, project.sequences[0], "review", "fade-truth");
    expect(result.filterGraph).toContain("alpha(X,Y)*");
    expect(result.filterGraph).toContain("T+1");
    expect(result.filterGraph).toContain("3.25");
  });

  it("uses a frame-safe QA plan for short and image-sequence formats", () => {
    expect(qaSamplePlan(1 / 30, 30, 1).map((sample) => sample.frame)).toEqual([0, 0, 0, 0]);
    expect(qaSamplePlan(0.1, 30, 3).every((sample) => sample.frame >= 0 && sample.frame <= 2)).toBe(true);
    expect(qaSamplePlan(2, 1, 2).map((sample) => sample.frame)).toEqual([0, 0, 1, 1]);
    expect(qaSamplePlan(2, 30, 60).at(-1)?.frame).toBeLessThan(60);
    expect(qaSamplePlan(1, 12, 12)).toEqual(qaSamplePlan(1, 12, 12));
    expect(new RenderPipelineError("QA_EXTRACTION_FAILURE", "frame unavailable").kind).toBe("QA_EXTRACTION_FAILURE");
  });

  it("does not wire both click and double-click to asset insertion", async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const source = await fs.readFile(path.join(root, "src", "components", "MediaBin.tsx"), "utf8");
    const row = source.slice(source.indexOf("className=\"asset-row\""), source.indexOf("className=\"asset-row\"") + 420);
    expect(row).toContain("onClick={() => addAssetToTimeline(asset)}");
    expect(row).not.toContain("onDoubleClick={() => addAssetToTimeline(asset)}");
  });
});

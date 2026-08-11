import { describe, expect, it } from "vitest";
import {
  createDefaultProject,
  createMediaClip,
  createTextClip,
  validateProject,
  type MediaAsset,
  type ReelClip,
  type ReelProject
} from "../shared/project.ts";

function validProject(): ReelProject {
  const project = createDefaultProject("Strict Recipe Contract");
  const sequence = project.sequences[0];
  sequence.duration = 12;
  const asset: MediaAsset = {
    id: crypto.randomUUID(),
    name: "Managed plate",
    kind: "video",
    fileName: `${crypto.randomUUID()}-managed-plate.mp4`,
    hash: "a".repeat(64),
    duration: 10,
    width: 1080,
    height: 1920,
    fps: 30,
    hasAudio: true,
    audioSampleRate: 48000,
    createdAt: new Date().toISOString(),
    mediaUrl: ""
  };
  asset.mediaUrl = `/api/v1/projects/${project.id}/assets/${asset.id}`;
  project.assets.push(asset);
  const videoTrack = sequence.tracks.find((track) => track.kind === "video")!;
  const media = createMediaClip(asset, videoTrack.id, 0);
  media.duration = 5;
  videoTrack.clips.push(media);
  const graphics = sequence.tracks.find((track) => track.kind === "graphics")!;
  const text = createTextClip(graphics.id, 1, 3);
  text.keyframes.x = [
    { id: crypto.randomUUID(), frame: 0, value: -80, easing: "linear" },
    { id: crypto.randomUUID(), frame: 30, value: 0, easing: "ease-out" }
  ];
  graphics.clips.push(text);
  const shape: ReelClip = {
    ...createTextClip(graphics.id, 5, 2),
    id: crypto.randomUUID(),
    kind: "shape",
    name: "Signal",
    text: undefined,
    textStyle: undefined,
    shape: { type: "line", color: "#74f4ff", width: 300, height: 2 }
  };
  graphics.clips.push(shape);
  return project;
}

function clone(): ReelProject {
  return structuredClone(validProject());
}

function expectInvalid(project: unknown, fragment: string): void {
  const result = validateProject(project);
  expect(result.valid).toBe(false);
  expect(result.errors.join("\n")).toContain(fragment);
}

describe("strict HRC Recipe v1 validation", () => {
  it("accepts a complete managed project", () => {
    expect(validateProject(validProject())).toEqual({ valid: true, errors: [] });
  });

  it("rejects invalid project identity, timestamps, and unknown fields", () => {
    const unsafeId = clone();
    unsafeId.id = "../escape";
    expectInvalid(unsafeId, "project.id");
    const badTime = clone();
    badTime.updatedAt = "tomorrow-ish";
    expectInvalid(badTime, "project.updatedAt");
    const unsupportedVersion = clone() as unknown as Record<string, unknown>;
    unsupportedVersion.schemaVersion = 99;
    expectInvalid(unsupportedVersion, "project.schemaVersion");
    const shellField = clone() as unknown as Record<string, unknown>;
    shellField.shell = "rm -rf /";
    expectInvalid(shellField, "project.shell is not supported");
  });

  it("rejects duplicate and malformed managed assets", () => {
    const duplicate = clone();
    duplicate.assets.push(structuredClone(duplicate.assets[0]));
    expectInvalid(duplicate, "duplicate asset id");
    const unsafeName = clone();
    unsafeName.assets[0].fileName = "../plate.mp4";
    expectInvalid(unsafeName, "assets[0].fileName");
    const badHash = clone();
    badHash.assets[0].hash = "not-a-sha";
    expectInvalid(badHash, "assets[0].hash");
    const badMetadata = clone();
    badMetadata.assets[0].fps = Number.POSITIVE_INFINITY;
    expectInvalid(badMetadata, "assets[0].fps");
    const badUrl = clone();
    badUrl.assets[0].mediaUrl = "file:///etc/passwd";
    expectInvalid(badUrl, "assets[0].mediaUrl");
  });

  it("rejects invalid sequences, tracks, and active references", () => {
    const danglingActive = clone();
    danglingActive.activeSequenceId = crypto.randomUUID();
    expectInvalid(danglingActive, "project.activeSequenceId");
    const dimensions = clone();
    dimensions.sequences[0].width = 999;
    expectInvalid(dimensions, "sequences[0].width");
    const badFps = clone();
    badFps.sequences[0].fps = Number.NaN;
    expectInvalid(badFps, "sequences[0].fps");
    const duplicateTrack = clone();
    duplicateTrack.sequences[0].tracks[1].id = duplicateTrack.sequences[0].tracks[0].id;
    expectInvalid(duplicateTrack, "duplicate track id");
    const mismatchedTrack = clone();
    mismatchedTrack.sequences[0].tracks[0].clips[0].trackId = crypto.randomUUID();
    expectInvalid(mismatchedTrack, "trackId must match");
  });

  it("rejects malformed clip timing, transforms, fades, and references", () => {
    const danglingAsset = clone();
    const media = danglingAsset.sequences[0].tracks.find((track) => track.kind === "video")!.clips[0];
    media.assetId = crypto.randomUUID();
    expectInvalid(danglingAsset, "assetId does not resolve");
    const badDuration = clone();
    badDuration.sequences[0].tracks[0].clips[0].duration = 0;
    expectInvalid(badDuration, "duration");
    const overflow = clone();
    overflow.sequences[0].tracks[0].clips[0].timelineStart = 11;
    overflow.sequences[0].tracks[0].clips[0].duration = 2;
    expectInvalid(overflow, "exceeds sequence duration");
    const sourceIn = clone();
    sourceIn.sequences[0].tracks.find((track) => track.kind === "video")!.clips[0].sourceIn = -1;
    expectInvalid(sourceIn, "sourceIn");
    const playback = clone();
    playback.sequences[0].tracks[0].clips[0].playbackRate = Number.POSITIVE_INFINITY;
    expectInvalid(playback, "playbackRate");
    const opacity = clone();
    opacity.sequences[0].tracks[0].clips[0].transform.opacity = 1.5;
    expectInvalid(opacity, "transform.opacity");
    const fade = clone();
    fade.sequences[0].tracks[0].clips[0].fadeIn = 4;
    expectInvalid(fade, "fadeIn + fadeOut");
  });

  it("rejects malformed text and shape payloads", () => {
    const missingStyle = clone();
    delete missingStyle.sequences[0].tracks[0].clips[0].textStyle;
    expectInvalid(missingStyle, "textStyle is required");
    const badFont = clone();
    badFont.sequences[0].tracks[0].clips[0].textStyle!.fontFamily = "Outfit" as never;
    expectInvalid(badFont, "fontFamily");
    const badDirection = clone();
    badDirection.sequences[0].tracks[0].clips[0].textStyle!.direction = "auto" as never;
    expectInvalid(badDirection, "direction");
    const missingShape = clone();
    const shape = missingShape.sequences[0].tracks[0].clips.find((clip) => clip.kind === "shape")!;
    delete shape.shape;
    expectInvalid(missingShape, "shape is required");
    const badColor = clone();
    badColor.sequences[0].tracks[0].clips.find((clip) => clip.kind === "shape")!.shape!.color = "cyan";
    expectInvalid(badColor, "shape.color");
  });

  it("rejects malformed and nondeterministic keyframes", () => {
    const unknownProperty = clone();
    unknownProperty.sequences[0].tracks[0].clips[0].keyframes.shell = [];
    expectInvalid(unknownProperty, "keyframes.shell");
    const duplicateFrame = clone();
    const keyframes = duplicateFrame.sequences[0].tracks[0].clips[0].keyframes.x;
    keyframes[1].frame = keyframes[0].frame;
    expectInvalid(duplicateFrame, "duplicate frame");
    const unordered = clone();
    unordered.sequences[0].tracks[0].clips[0].keyframes.x.reverse();
    expectInvalid(unordered, "deterministic frame order");
    const infinite = clone();
    infinite.sequences[0].tracks[0].clips[0].keyframes.x[0].value = Number.NEGATIVE_INFINITY;
    expectInvalid(infinite, "value");
    const badEasing = clone();
    badEasing.sequences[0].tracks[0].clips[0].keyframes.x[0].easing = "spring" as never;
    expectInvalid(badEasing, "easing");
  });

  it("rejects invalid render settings", () => {
    const preset = clone();
    preset.renderSettings.preset = "avi" as never;
    expectInvalid(preset, "renderSettings.preset");
    const normalize = clone() as unknown as { renderSettings: Record<string, unknown> };
    normalize.renderSettings.normalizeAudio = "yes";
    expectInvalid(normalize, "renderSettings.normalizeAudio");
    const loudness = clone();
    loudness.renderSettings.loudnessTarget = -100;
    expectInvalid(loudness, "renderSettings.loudnessTarget");
  });
});

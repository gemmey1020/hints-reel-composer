import { describe, expect, it } from "vitest";
import { createDefaultProject, createMediaClip, createTextClip, type MediaAsset } from "../shared/project.ts";
import { compileRender, keyframeExpression } from "../server/renderCompiler.ts";

describe("render graph compiler", () => {
  it("compiles managed media, typography, audio, and delivery settings", () => {
    const project = createDefaultProject("Compiler Test");
    const sequence = project.sequences[0];
    const asset: MediaAsset = {
      id: crypto.randomUUID(), name: "plate", kind: "video", fileName: "safe-plate.mp4", hash: "a".repeat(64),
      duration: 8, width: 1080, height: 1920, fps: 30, hasAudio: true, createdAt: new Date().toISOString(), mediaUrl: "/asset"
    };
    project.assets.push(asset);
    const videoTrack = sequence.tracks.find((track) => track.kind === "video")!;
    videoTrack.clips.push(createMediaClip(asset, videoTrack.id, 0));
    const textTrack = sequence.tracks.find((track) => track.kind === "graphics")!;
    const title = createTextClip(textTrack.id, 1, 3);
    title.text = "ONE SIGNAL";
    textTrack.clips.push(title);
    const result = compileRender(project, sequence, "delivery", "test-output");
    expect(result.filterGraph).toContain("overlay=");
    expect(result.filterGraph).toContain("drawtext=");
    expect(result.filterGraph).toContain("loudnorm=I=-16");
    expect(result.args).toContain("libx264");
    expect(result.args).toContain("14");
    expect(result.outputFileName).toBe("test-output.mp4");
  });

  it("compiles frame keyframes into deterministic FFmpeg expressions", () => {
    const project = createDefaultProject("Keyframe parity");
    const sequence = project.sequences[0];
    const clip = createTextClip(sequence.tracks[0].id, 1);
    clip.keyframes.y = [
      { id: "a", frame: 0, value: 320, easing: "linear" },
      { id: "b", frame: 30, value: -240, easing: "ease-in-out" }
    ];
    sequence.tracks[0].clips.push(clip);
    const expression = keyframeExpression(clip, "y", clip.transform.y, sequence.fps);
    const render = compileRender(project, sequence, "review", "keyframe-parity");
    expect(expression).toContain("if(lt(t\\,");
    expect(expression).toContain("-240");
    expect(render.filterGraph).toContain(expression);
  });
});

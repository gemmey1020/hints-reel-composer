import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PARITY_CONTRACT,
  createDefaultProject,
  createTextClip,
  validateProject,
  type ReelClip
} from "../shared/project.ts";
import { compileRender } from "../server/renderCompiler.ts";
import { previewTextFontSize } from "../src/lib/editor.ts";

describe("Preview to Export parity contract", () => {
  it("declares every supported V1 property and final-render authority", () => {
    const required = [
      "timing", "visibility", "ordering", "position", "scale", "rotation", "opacity", "trim", "fades",
      "ltr-text", "rtl-text", "multiline-text", "line-height", "text-alignment", "shape", "keyframes", "audio-state"
    ];
    expect(required.every((property) => PARITY_CONTRACT.some((entry) => entry.property === property))).toBe(true);
    expect(PARITY_CONTRACT.every((entry) => ["EXACT_PARITY_REQUIRED", "BOUNDED_VISUAL_PARITY", "EXPORT_AUTHORITATIVE", "UNSUPPORTED_REMOVE_FROM_UI"].includes(entry.state))).toBe(true);
    expect(PARITY_CONTRACT.find((entry) => entry.property === "tracking")?.state).toBe("UNSUPPORTED_REMOVE_FROM_UI");
  });

  it("constrains unsupported tracking instead of preserving a lying control", () => {
    const project = createDefaultProject("Tracking boundary");
    const track = project.sequences[0].tracks.find((candidate) => candidate.kind === "graphics")!;
    const clip = createTextClip(track.id, 0, 2);
    track.clips.push(clip);
    expect(validateProject(project)).toEqual({ valid: true, errors: [] });
    clip.textStyle!.letterSpacing = 1;
    expect(validateProject(project).errors.join("\n")).toContain("letterSpacing must be 0");
  });

  it("compiles shaped aligned multiline text with line height and transform rotation", () => {
    const project = createDefaultProject("Typography parity");
    const sequence = project.sequences[0];
    const track = sequence.tracks.find((candidate) => candidate.kind === "graphics")!;
    const clip = createTextClip(track.id, 0, 2);
    clip.text = "إشارة واحدة\nONE SIGNAL";
    clip.textStyle!.fontFamily = "Tajawal";
    clip.textStyle!.direction = "rtl";
    clip.textStyle!.align = "right";
    clip.textStyle!.lineHeight = 1.35;
    clip.transform.rotation = 7;
    track.clips.push(clip);
    const render = compileRender(project, sequence, "review", "typography-parity");
    expect(render.filterGraph).toContain("text_shaping=1");
    expect(render.filterGraph).toContain("text_align=R");
    expect(render.filterGraph).toContain("*1.35");
    expect(render.filterGraph.match(/drawtext=/g)).toHaveLength(2);
    expect(render.filterGraph).toContain("rotate='");
    expect(render.filterGraph).toContain("overlay=x='");
  });

  it("compiles shape scale rotation opacity fades and keyframes as a real layer", () => {
    const project = createDefaultProject("Shape parity");
    const sequence = project.sequences[0];
    const track = sequence.tracks.find((candidate) => candidate.kind === "graphics")!;
    const shape: ReelClip = {
      id: crypto.randomUUID(), trackId: track.id, kind: "shape", name: "Signal",
      timelineStart: 0.25, duration: 2, sourceIn: 0, playbackRate: 1, enabled: true,
      transform: { x: 14, y: -20, scale: 1.2, rotation: 6, opacity: 0.8, fit: "contain" },
      shape: { type: "line", color: "#74f4ff", width: 600, height: 4 },
      audioGain: 1, fadeIn: 0.2, fadeOut: 0.3,
      keyframes: { scale: [{ id: crypto.randomUUID(), frame: 0, value: 0.8, easing: "linear" }, { id: crypto.randomUUID(), frame: 30, value: 1.2, easing: "ease-out" }] }
    };
    track.clips.push(shape);
    const render = compileRender(project, sequence, "review", "shape-parity");
    expect(render.filterGraph).toContain("color=c=0x74f4ff");
    expect(render.filterGraph).toContain("rotate='");
    expect(render.filterGraph).toContain("alpha(X,Y)*");
    expect(render.filterGraph).toContain("T+0.25");
  });

  it("uses the same reference-height typography scale at multiple ratios", () => {
    expect(previewTextFontSize(64, 1920, 0.25)).toBe(16);
    expect(previewTextFontSize(64, 1080, 0.25)).toBe(9);
  });

  it("surfaces export authority and removes the unsupported tracking input", async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const [preview, inspector] = await Promise.all([
      fs.readFile(path.join(root, "src", "components", "PreviewStage.tsx"), "utf8"),
      fs.readFile(path.join(root, "src", "components", "Inspector.tsx"), "utf8")
    ]);
    expect(preview).toContain("Final render is delivery authority");
    expect(inspector).not.toContain('label="Tracking"');
  });
});

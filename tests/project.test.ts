import { describe, expect, it } from "vitest";
import { createDefaultProject, createTextClip, RATIO_PRESETS, validateProject } from "../shared/project.ts";

describe("HRC Recipe v1", () => {
  it("creates all approved aspect-ratio sequences", () => {
    const project = createDefaultProject("Ratio Contract");
    expect(project.sequences.map((sequence) => sequence.aspectRatio)).toEqual(["9:16", "16:9", "1:1", "4:5"]);
    for (const sequence of project.sequences) {
      expect({ width: sequence.width, height: sequence.height }).toEqual(RATIO_PRESETS[sequence.aspectRatio]);
      expect(sequence.tracks).toHaveLength(5);
    }
  });

  it("validates a timeline recipe and rejects unsafe time values", () => {
    const project = createDefaultProject("Validation");
    const track = project.sequences[0].tracks[0];
    track.clips.push(createTextClip(track.id, 2, 4));
    expect(validateProject(project)).toEqual({ valid: true, errors: [] });
    track.clips[0].duration = 0;
    expect(validateProject(project).valid).toBe(false);
  });
});

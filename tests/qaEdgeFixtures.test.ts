import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hrc-qa-edges-"));
  process.env.HINTS_REEL_PROJECTS_DIR = path.join(root, "projects");
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.HINTS_REEL_PROJECTS_DIR;
  await fs.rm(root, { recursive: true, force: true });
});

function createVideo(output: string, fps: number, duration: number, frames?: number): void {
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=s=64x64:r=${fps}:d=${duration}`,
    ...(frames ? ["-frames:v", String(frames)] : []),
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", output
  ]);
}

describe("frame-safe QA edge fixtures", () => {
  it("extracts valid samples from short, low-fps, image-sequence, and animated WebP outputs", async () => {
    const { RenderJobManager } = await import("../server/renderJobs.ts");
    const projectId = "qa-edge-project";
    const fixtures = path.join(root, "fixtures");
    await fs.mkdir(fixtures, { recursive: true });
    const manager = new RenderJobManager() as unknown as {
      runQa: (job: { id: string; projectId: string }, output: string, duration: number, fps: number, frameDirectory?: string) => Promise<void>;
    };

    const cases: Array<{ id: string; output: string; duration: number; fps: number; frameDirectory?: string }> = [];
    const oneFrame = path.join(fixtures, "one-frame.mp4");
    createVideo(oneFrame, 30, 1 / 30, 1);
    cases.push({ id: "one-frame", output: oneFrame, duration: 1 / 30, fps: 30 });

    const veryShort = path.join(fixtures, "very-short.mp4");
    createVideo(veryShort, 30, 0.1, 3);
    cases.push({ id: "very-short", output: veryShort, duration: 0.1, fps: 30 });

    const lowFps = path.join(fixtures, "low-fps.mp4");
    createVideo(lowFps, 1, 2, 2);
    cases.push({ id: "low-fps", output: lowFps, duration: 2, fps: 1 });

    const standard = path.join(fixtures, "standard-30fps.mp4");
    createVideo(standard, 30, 1, 30);
    cases.push({ id: "standard-30fps", output: standard, duration: 1, fps: 30 });

    const pngFrames = path.join(fixtures, "png-frames");
    await fs.mkdir(pngFrames);
    for (const [index, color] of ["#04080c", "#2ed9e9", "#2337ff"].entries()) {
      execFileSync("magick", ["-size", "64x64", `xc:${color}`, path.join(pngFrames, `frame-${String(index).padStart(6, "0")}.png`)]);
    }
    const pngArchive = path.join(fixtures, "png-sequence.zip");
    await fs.writeFile(pngArchive, "fixture archive marker");
    cases.push({ id: "png-sequence", output: pngArchive, duration: 0.1, fps: 30, frameDirectory: pngFrames });

    const animatedWebp = path.join(fixtures, "animated.webp");
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=s=64x64:r=5:d=1",
      "-an", "-c:v", "libwebp_anim", "-quality", "90", "-loop", "0", animatedWebp
    ]);
    cases.push({ id: "animated-webp", output: animatedWebp, duration: 1, fps: 5 });

    for (const fixture of cases) {
      await manager.runQa({ id: fixture.id, projectId }, fixture.output, fixture.duration, fixture.fps, fixture.frameDirectory);
      const reportPath = path.join(process.env.HINTS_REEL_PROJECTS_DIR!, `${projectId}.hintsreel`, "qa", fixture.id, "qa-report.json");
      const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as {
        frameSamples: Array<{ frame: number; timestamp: number; file: string }>;
        checks: Record<string, boolean | string>;
        technical: { actualFrameCount: number };
      };
      expect(report.frameSamples).toHaveLength(4);
      expect(report.frameSamples.every((sample) => sample.frame >= 0 && sample.frame < report.technical.actualFrameCount)).toBe(true);
      expect(report.checks.durationPresent).toBe(true);
      expect(report.checks.dimensionsPresent).toBe(true);
      expect(report.checks.frameRatePresent).toBe(true);
      expect(report.checks.sampleFramesPresent).toBe(true);
    }
  }, 30_000);

  it("classifies encode, extraction, and technical QA failures separately", async () => {
    const { RenderJobManager } = await import("../server/renderJobs.ts");
    const projectId = "qa-failure-project";
    const projectRoot = path.join(process.env.HINTS_REEL_PROJECTS_DIR!, `${projectId}.hintsreel`);
    await fs.mkdir(path.join(projectRoot, "logs"), { recursive: true });
    const manager = new RenderJobManager() as unknown as {
      spawnFfmpeg: (job: { id: string; projectId: string; stage: string }, args: string[], duration: number) => Promise<void>;
      runQa: (job: { id: string; projectId: string }, output: string, duration: number, fps: number, frameDirectory?: string) => Promise<void>;
    };

    await expect(manager.spawnFfmpeg({ id: "encode", projectId, stage: "rendering" }, ["-definitely-invalid-option"], 1))
      .rejects.toMatchObject({ kind: "ENCODE_FAILURE" });
    await expect(manager.runQa({ id: "technical", projectId }, path.join(root, "missing.mp4"), 1, 30))
      .rejects.toMatchObject({ kind: "TECHNICAL_QA_FAILURE" });

    const brokenFrames = path.join(root, "broken-png-sequence");
    await fs.mkdir(path.join(brokenFrames, "frame-000000.png"), { recursive: true });
    const archive = path.join(root, "broken-png-sequence.zip");
    await fs.writeFile(archive, "fixture archive marker");
    await expect(manager.runQa({ id: "extraction", projectId }, archive, 1 / 30, 30, brokenFrames))
      .rejects.toMatchObject({ kind: "QA_EXTRACTION_FAILURE" });
  });
});

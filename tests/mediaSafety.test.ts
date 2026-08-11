import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hrc-media-safety-"));
  process.env.HINTS_REEL_PROJECTS_DIR = path.join(root, "projects");
  delete process.env.HRC_MAX_IMPORT_BYTES;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.HINTS_REEL_PROJECTS_DIR;
  delete process.env.HRC_MAX_IMPORT_BYTES;
  await fs.rm(root, { recursive: true, force: true });
});

describe("managed media safety", () => {
  it("treats FFprobe as authority when MIME and extension are misleading", async () => {
    const { createProject, readProject } = await import("../server/projectStore.ts");
    const { importUploadedMedia } = await import("../server/media.ts");
    const project = await createProject("Probe authority");
    const upload = path.join(root, "upload.png");
    execFileSync("magick", ["-size", "32x32", "xc:#2ed9e9", upload]);
    const asset = await importUploadedMedia(project.id, upload, "misleading.mp4", "video/mp4");
    expect(asset.kind).toBe("image");
    expect(asset.fileName).toMatch(/\.png$/);
    expect((await readProject(project.id)).assets).toHaveLength(1);
    await expect(fs.access(upload)).rejects.toThrow();
  });

  it("rejects corrupt media transactionally without orphan files", async () => {
    const { createProject, readProject } = await import("../server/projectStore.ts");
    const { importUploadedMedia } = await import("../server/media.ts");
    const project = await createProject("Corrupt media");
    const upload = path.join(root, "corrupt.mp4");
    await fs.writeFile(upload, "not media");
    await expect(importUploadedMedia(project.id, upload, "corrupt.mp4", "video/mp4")).rejects.toThrow(/probe|media|stream/i);
    expect((await readProject(project.id)).assets).toHaveLength(0);
    expect(await fs.readdir(path.join(process.env.HINTS_REEL_PROJECTS_DIR!, `${project.id}.hintsreel`, "media"))).toEqual([]);
    await expect(fs.access(upload)).rejects.toThrow();
  });

  it("rejects symlink uploads and explicit size-limit abuse", async () => {
    const { createProject } = await import("../server/projectStore.ts");
    const { importUploadedMedia } = await import("../server/media.ts");
    const project = await createProject("Symlink guard");
    const target = path.join(root, "target.png");
    execFileSync("magick", ["-size", "16x16", "xc:white", target]);
    const link = path.join(root, "upload-link.png");
    await fs.symlink(target, link);
    await expect(importUploadedMedia(project.id, link, "link.png", "image/png")).rejects.toThrow(/symbolic link/i);
    await expect(fs.access(target)).resolves.toBeUndefined();

    process.env.HRC_MAX_IMPORT_BYTES = "8";
    const oversized = path.join(root, "oversized.bin");
    await fs.writeFile(oversized, Buffer.alloc(16));
    await expect(importUploadedMedia(project.id, oversized, "oversized.mp4", "video/mp4")).rejects.toThrow(/size limit/i);
    await expect(fs.access(oversized)).rejects.toThrow();
  });

  it("rejects managed project paths that resolve outside the project sandbox", async () => {
    const { createProject } = await import("../server/projectStore.ts");
    const { importUploadedMedia } = await import("../server/media.ts");
    const project = await createProject("Project sandbox guard");
    const projectRoot = path.join(process.env.HINTS_REEL_PROJECTS_DIR!, `${project.id}.hintsreel`);
    const outside = path.join(root, "outside-media");
    await fs.mkdir(outside);
    await fs.rm(path.join(projectRoot, "media"), { recursive: true });
    await fs.symlink(outside, path.join(projectRoot, "media"));
    const upload = path.join(root, "sandbox.png");
    execFileSync("magick", ["-size", "16x16", "xc:#2337ff", upload]);
    await expect(importUploadedMedia(project.id, upload, "sandbox.png", "image/png")).rejects.toThrow(/escapes the allowed project sandbox/i);
    expect(await fs.readdir(outside)).toEqual([]);
    await expect(fs.access(upload)).rejects.toThrow();
  });

  it("parses only bounded single HTTP byte ranges", async () => {
    const { parseByteRange } = await import("../server/media.ts");
    expect(parseByteRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=90-999", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=100-", 100)).toBeNull();
    expect(parseByteRange("bytes=50-40", 100)).toBeNull();
    expect(parseByteRange("bytes=0-1,4-5", 100)).toBeNull();
    expect(parseByteRange("items=0-9", 100)).toBeNull();
  });

  it("surfaces malformed project diagnostics instead of silently swallowing them", async () => {
    const { createProject, listProjects } = await import("../server/projectStore.ts");
    await createProject("Healthy project");
    const malformed = path.join(process.env.HINTS_REEL_PROJECTS_DIR!, "malformed-project.hintsreel");
    await fs.mkdir(malformed, { recursive: true });
    await fs.writeFile(path.join(malformed, "project.json"), "{broken json");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("malformed-project.hintsreel"));
    warning.mockRestore();
  });

  it("prevents Recipe apply from changing project identity or inventing managed assets", async () => {
    const { createProject, importRecipe } = await import("../server/projectStore.ts");
    const project = await createProject("Managed Recipe identity");
    const foreign = structuredClone(project);
    foreign.id = crypto.randomUUID();
    await expect(importRecipe(project.id, foreign)).rejects.toThrow(/project id must match/i);

    const invented = structuredClone(project);
    const assetId = crypto.randomUUID();
    invented.assets.push({
      id: assetId,
      name: "Invented asset",
      kind: "audio",
      fileName: `${assetId}-invented.wav`,
      hash: "b".repeat(64),
      duration: 1,
      width: 0,
      height: 0,
      fps: 0,
      hasAudio: true,
      audioSampleRate: 48000,
      createdAt: new Date().toISOString(),
      mediaUrl: `/api/v1/projects/${project.id}/assets/${assetId}`
    });
    await expect(importRecipe(project.id, invented)).rejects.toThrow(/managed asset inventory/i);
  });
});

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hrc-proxy-"));
  process.env.HINTS_REEL_PROJECTS_DIR = path.join(root, "projects");
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.HINTS_REEL_PROJECTS_DIR;
  await fs.rm(root, { recursive: true, force: true });
});

describe("preview proxy lifecycle", () => {
  it("binds a derived proxy to the source hash and falls back when metadata is stale", async () => {
    const { createProject, readProject } = await import("../server/projectStore.ts");
    const { createProxy, importUploadedMedia, resolvePreviewMedia } = await import("../server/media.ts");
    const project = await createProject("Proxy truth");
    const upload = path.join(root, "source.mp4");
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=s=96x160:r=10:d=1",
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", upload
    ]);
    const asset = await importUploadedMedia(project.id, upload, "source.mp4", "video/mp4");
    const proxy = await createProxy(project.id, asset.id);
    const updated = await readProject(project.id);
    const managed = updated.assets.find((candidate) => candidate.id === asset.id)!;
    expect(managed.proxyUrl).toBe(proxy.proxyUrl);
    expect(managed.proxySourceHash).toBe(asset.hash);
    expect((await resolvePreviewMedia(project.id, asset.id)).usedProxy).toBe(true);

    const metadataPath = path.join(process.env.HINTS_REEL_PROJECTS_DIR!, `${project.id}.hintsreel`, "proxies", `${asset.id}-540p.json`);
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    metadata.sourceHash = "0".repeat(64);
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
    const fallback = await resolvePreviewMedia(project.id, asset.id);
    expect(fallback.usedProxy).toBe(false);
    expect(path.basename(fallback.filePath)).toBe(asset.fileName);
  });
});

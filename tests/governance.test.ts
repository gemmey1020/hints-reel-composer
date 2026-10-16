import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { cleanBuildOutputs, findBuildPolicyViolations } from "../scripts/build-governance.ts";
import { fontPath } from "../server/paths.ts";

const composerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = composerRoot;
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function gitIgnored(relativePath: string): boolean {
  return spawnSync("git", ["check-ignore", "-q", relativePath], { cwd: repositoryRoot }).status === 0;
}

describe("Composer source governance", () => {
  it("tracks source inputs while excluding runtime and generated state", () => {
    expect(gitIgnored("src/App.tsx")).toBe(false);
    expect(gitIgnored("package-lock.json")).toBe(false);
    expect(gitIgnored("reel_projects/example.hintsreel/project.json")).toBe(true);
    expect(gitIgnored("server-dist/server/index.js")).toBe(true);
    expect(gitIgnored(".render-tmp/upload.bin")).toBe(true);
  });

  it("cleans build outputs and detects packaged runtime state", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hrc-governance-"));
    temporaryRoots.push(root);
    await fs.mkdir(path.join(root, "dist", "assets"), { recursive: true });
    await fs.mkdir(path.join(root, "server-dist", "reel_projects", "unsafe.hintsreel"), { recursive: true });
    await fs.writeFile(path.join(root, "dist", "assets", "app.js"), "ok");
    await fs.writeFile(path.join(root, "server-dist", "reel_projects", "unsafe.hintsreel", "project.json"), "{}");

    expect(await findBuildPolicyViolations(root)).toContain("server-dist/reel_projects");
    await cleanBuildOutputs(root);
    await expect(fs.access(path.join(root, "dist"))).rejects.toThrow();
    await expect(fs.access(path.join(root, "server-dist"))).rejects.toThrow();
  });

  it("uses canonical local fonts and rejects the former experiment-only Outfit source", () => {
    expect(fontPath("Bomstad Display", 700)).toContain("brand_canon/source/fonts/bomstad_display");
    expect(fontPath("Hakira", 400)).toContain("brand_canon/source/fonts/hakira");
    expect(() => fontPath("Outfit", 400)).toThrow(/Unsupported canonical font/);
  });

  it("handles favicon requests before the SPA fallback", async () => {
    const source = await fs.readFile(path.join(composerRoot, "server", "index.ts"), "utf8");
    const faviconRoute = source.indexOf('app.get("/favicon.ico"');
    const productionFallback = source.indexOf('app.get("/{*path}"');
    expect(faviconRoute).toBeGreaterThan(-1);
    expect(productionFallback).toBeGreaterThan(faviconRoute);
  });
});

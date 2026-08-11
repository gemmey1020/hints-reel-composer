import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const parentDir = path.resolve(currentDir, "..");

export const COMPOSER_ROOT = path.basename(parentDir) === "server-dist" ? path.resolve(parentDir, "..") : parentDir;
export const STUDIO_ROOT = path.resolve(COMPOSER_ROOT, "..");
export const PROJECTS_ROOT = path.resolve(
  process.env.HINTS_REEL_PROJECTS_DIR || path.join(COMPOSER_ROOT, "reel_projects")
);
export const UPLOAD_ROOT = path.join(COMPOSER_ROOT, ".render-tmp", "uploads");
export const BRAND_FONT_ROOT = path.join(STUDIO_ROOT, "brand_canon", "source", "fonts");
export const BRAND_LOGO_ROOT = path.join(STUDIO_ROOT, "brand_canon", "exports", "logo", "approved_system");

export async function ensureRuntimeRoots(): Promise<void> {
  await Promise.all([
    fs.mkdir(PROJECTS_ROOT, { recursive: true }),
    fs.mkdir(UPLOAD_ROOT, { recursive: true })
  ]);
}

export function assertSafeId(id: string, label = "id"): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,127}$/.test(id)) {
    throw new Error(`Invalid ${label}.`);
  }
  return id;
}

export function projectDir(projectId: string): string {
  return path.join(PROJECTS_ROOT, `${assertSafeId(projectId, "project id")}.hintsreel`);
}

export function assertInside(parent: string, candidate: string): string {
  const root = path.resolve(parent) + path.sep;
  const resolved = path.resolve(candidate);
  if (resolved !== path.resolve(parent) && !resolved.startsWith(root)) {
    throw new Error("Path escapes the allowed project sandbox.");
  }
  return resolved;
}

export function projectFile(projectId: string, ...parts: string[]): string {
  const root = projectDir(projectId);
  return assertInside(root, path.join(root, ...parts));
}

async function realProjectRoot(projectId: string): Promise<string> {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  const projectsRoot = await fs.realpath(PROJECTS_ROOT);
  const root = await fs.realpath(projectDir(projectId));
  return assertInside(projectsRoot, root);
}

export async function resolveExistingProjectFile(projectId: string, ...parts: string[]): Promise<string> {
  const root = await realProjectRoot(projectId);
  const candidate = await fs.realpath(projectFile(projectId, ...parts));
  return assertInside(root, candidate);
}

export async function resolveProjectWriteFile(projectId: string, ...parts: string[]): Promise<string> {
  const root = await realProjectRoot(projectId);
  const candidate = projectFile(projectId, ...parts);
  const parent = await fs.realpath(path.dirname(candidate));
  assertInside(root, parent);
  return assertInside(root, path.join(parent, path.basename(candidate)));
}

export function fontPath(family: string, weight = 700): string {
  if (family === "Hakira") {
    return path.join(BRAND_FONT_ROOT, "hakira", "otf", weight >= 700 ? "Hakira-Bold.otf" : "Hakira-Regular.otf");
  }
  if (family === "Tajawal") {
    return path.join(BRAND_FONT_ROOT, "company_profile_support", "Tajawal-Bold_0.ttf");
  }
  if (family === "Bomstad Display") {
    const normalizedWeight = weight >= 700 ? "Bold" : weight >= 600 ? "SemiBold" : weight >= 500 ? "Medium" : "Regular";
    return path.join(BRAND_FONT_ROOT, "bomstad_display", "otf", `BomstadDisplay-${normalizedWeight}.otf`);
  }
  throw new Error(`Unsupported canonical font family: ${family}`);
}

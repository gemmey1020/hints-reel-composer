import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUILD_OUTPUTS = ["dist", "server-dist"] as const;
const RUNTIME_DIRECTORY_NAMES = new Set([
  ".render-tmp",
  "autosaves",
  "logs",
  "media",
  "proxies",
  "qa",
  "reel_projects",
  "renders",
  "thumbnails",
  "waveforms"
]);

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function cleanBuildOutputs(root: string): Promise<void> {
  await Promise.all(BUILD_OUTPUTS.map((directory) => fs.rm(path.join(root, directory), { recursive: true, force: true })));
}

export async function findBuildPolicyViolations(root: string): Promise<string[]> {
  const violations = new Set<string>();

  async function visit(target: string): Promise<void> {
    if (!(await pathExists(target))) return;
    for (const entry of await fs.readdir(target, { withFileTypes: true })) {
      const absolute = path.join(target, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory() && RUNTIME_DIRECTORY_NAMES.has(entry.name)) {
        violations.add(relative);
        continue;
      }
      if (entry.isDirectory()) await visit(absolute);
      if (entry.isFile() && (entry.name === "project.json" || entry.name.endsWith(".hints-reel.json"))) {
        violations.add(relative);
      }
    }
  }

  await Promise.all(BUILD_OUTPUTS.map((directory) => visit(path.join(root, directory))));
  return [...violations].sort();
}

async function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const action = process.argv[2];
  if (action === "clean") {
    await cleanBuildOutputs(root);
    return;
  }
  if (action === "assert") {
    const violations = await findBuildPolicyViolations(root);
    if (violations.length > 0) {
      throw new Error(`Build output contains runtime or user state:\n${violations.join("\n")}`);
    }
    return;
  }
  throw new Error("Usage: build-governance.ts <clean|assert>");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

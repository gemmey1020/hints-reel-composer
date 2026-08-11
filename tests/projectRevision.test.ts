import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hrc-revision-"));
  process.env.HINTS_REEL_PROJECTS_DIR = path.join(root, "projects");
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.HINTS_REEL_PROJECTS_DIR;
  await fs.rm(root, { recursive: true, force: true });
});

describe("project revision ordering", () => {
  it("increments managed revisions and rejects stale writers", async () => {
    const { createProject, readProject, writeProject } = await import("../server/projectStore.ts");
    const initial = await createProject("Revision guard");
    expect(initial.revision).toBe(0);
    const firstWriter = structuredClone(initial);
    const staleWriter = structuredClone(initial);
    firstWriter.title = "First writer wins";
    staleWriter.title = "Stale writer must fail";

    const saved = await writeProject(firstWriter);
    expect(saved.revision).toBe(1);
    await expect(writeProject(staleWriter)).rejects.toMatchObject({ statusCode: 409 });
    const current = await readProject(initial.id);
    expect(current.revision).toBe(1);
    expect(current.title).toBe("First writer wins");
  });
});

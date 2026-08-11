import { describe, expect, it } from "vitest";
import { createDefaultProject, type ReelProject } from "../shared/project.ts";
import { ProjectPersistenceQueue } from "../src/lib/projectPersistence.ts";

describe("project persistence ordering", () => {
  it("serializes writes and rebases each candidate onto the latest server revision", async () => {
    const observed: Array<{ title: string; revision: number }> = [];
    const queue = new ProjectPersistenceQueue(0, async (candidate) => {
      observed.push({ title: candidate.title, revision: candidate.revision });
      if (candidate.title === "first") await new Promise((resolve) => setTimeout(resolve, 30));
      return { ...candidate, revision: candidate.revision + 1 };
    });
    const first = { ...createDefaultProject("first"), revision: 0 };
    const second = { ...createDefaultProject("second"), id: first.id, revision: 0 };

    const [savedFirst, savedSecond] = await Promise.all([queue.save(first), queue.save(second)]);

    expect(savedFirst.revision).toBe(1);
    expect(savedSecond.revision).toBe(2);
    expect(observed).toEqual([
      { title: "first", revision: 0 },
      { title: "second", revision: 1 }
    ]);
    expect(queue.revision).toBe(2);
  });

  it("serializes external project mutations with ordinary saves", async () => {
    const project = createDefaultProject("before import");
    const queue = new ProjectPersistenceQueue(0, async (candidate) => ({ ...candidate, revision: candidate.revision + 1 }));
    const save = queue.save(project);
    const imported = queue.mutate(async (revision) => ({ ...project, title: "after import", revision: revision + 1 } as ReelProject));

    await expect(save).resolves.toMatchObject({ revision: 1 });
    await expect(imported).resolves.toMatchObject({ title: "after import", revision: 2 });
    expect(queue.revision).toBe(2);
  });
});

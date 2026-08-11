import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hrc-render-operations-"));
  process.env.HINTS_REEL_PROJECTS_DIR = path.join(root, "projects");
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.HINTS_REEL_PROJECTS_DIR;
  await fs.rm(root, { recursive: true, force: true });
});

async function waitUntil(check: () => boolean, timeout = 2000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for render operation state.");
}

describe("durable bounded render operations", () => {
  it("enforces the concurrency cap and persists public states", async () => {
    const { RenderJobManager } = await import("../server/renderJobs.ts");
    const releases: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const manager = new RenderJobManager({
      stateRoot: path.join(root, "jobs"),
      concurrency: 1,
      executor: async (_job, context) => {
        active += 1;
        peak = Math.max(peak, active);
        context.update({ stage: "rendering", progress: 0.5, message: "test gate" });
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
      }
    });
    await manager.initialize();
    const first = await manager.create("project-one", "sequence-one", "draft");
    const second = await manager.create("project-two", "sequence-two", "review");
    await waitUntil(() => manager.get(first.id)?.stage === "rendering");
    expect(manager.get(second.id)?.stage).toBe("queued");
    releases.shift()?.();
    await waitUntil(() => manager.get(second.id)?.stage === "rendering");
    releases.shift()?.();
    await waitUntil(() => manager.get(second.id)?.stage === "complete");
    expect(peak).toBe(1);
    const persisted = JSON.parse(await fs.readFile(path.join(root, "jobs", `${second.id}.json`), "utf8"));
    expect(persisted.stage).toBe("complete");
  });

  it("reconciles interrupted work and allows only one explicit retry", async () => {
    const { RenderJobManager } = await import("../server/renderJobs.ts");
    const stateRoot = path.join(root, "jobs");
    await fs.mkdir(stateRoot, { recursive: true });
    const interrupted = {
      id: "interrupted-job", projectId: "project-one", sequenceId: "sequence-one", preset: "draft",
      stage: "rendering", progress: 0.4, message: "running before restart",
      createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:01.000Z",
      attempt: 1, maxAttempts: 2
    };
    await fs.writeFile(path.join(stateRoot, "interrupted-job.json"), JSON.stringify(interrupted));
    const manager = new RenderJobManager({
      stateRoot,
      concurrency: 1,
      executor: async () => { throw new Error("controlled retry failure"); }
    });
    await manager.initialize();
    expect(manager.get(interrupted.id)).toMatchObject({ stage: "failed", failureKind: "INTERRUPTED" });
    const retry = await manager.retry(interrupted.id);
    expect(retry).toMatchObject({ retryOf: interrupted.id, attempt: 2 });
    await waitUntil(() => manager.get(retry.id)?.stage === "failed");
    await expect(manager.retry(retry.id)).rejects.toThrow(/retry limit/i);
  });

  it("cancels queued and running jobs without leaving false running state", async () => {
    const { RenderJobManager } = await import("../server/renderJobs.ts");
    const manager = new RenderJobManager({
      stateRoot: path.join(root, "jobs"),
      concurrency: 1,
      executor: async (_job, context) => {
        context.update({ stage: "rendering", progress: 0.2, message: "waiting" });
        await new Promise<void>((resolve) => context.signal.addEventListener("abort", () => resolve(), { once: true }));
      }
    });
    await manager.initialize();
    const running = await manager.create("project-one", "sequence-one", "draft");
    const queued = await manager.create("project-two", "sequence-two", "draft");
    await waitUntil(() => manager.get(running.id)?.stage === "rendering");
    expect(manager.cancel(queued.id)).toBe(true);
    expect(manager.cancel(running.id)).toBe(true);
    await waitUntil(() => manager.get(running.id)?.stage === "cancelled");
    expect(manager.get(queued.id)?.stage).toBe("cancelled");
  });

  it("keeps bounded local load under a multi-job burst", async () => {
    const { RenderJobManager } = await import("../server/renderJobs.ts");
    let active = 0;
    let peak = 0;
    const manager = new RenderJobManager({
      stateRoot: path.join(root, "jobs"),
      concurrency: 2,
      executor: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
      }
    });
    await manager.initialize();
    const jobs = await Promise.all(Array.from({ length: 12 }, (_, index) => manager.create(`project-${index}`, `sequence-${index}`, "draft")));
    await waitUntil(() => jobs.every((job) => manager.get(job.id)?.stage === "complete"), 5000);
    expect(peak).toBe(2);
    expect(manager.list()).toHaveLength(12);
  });

  it("applies the documented state retention boundary without touching outputs", async () => {
    const { RenderJobManager } = await import("../server/renderJobs.ts");
    const stateRoot = path.join(root, "jobs");
    await fs.mkdir(stateRoot, { recursive: true });
    const stale = {
      id: "stale-job", projectId: "project-one", sequenceId: "sequence-one", preset: "draft",
      stage: "complete", progress: 1, message: "complete",
      createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z",
      attempt: 1, maxAttempts: 2
    };
    await fs.writeFile(path.join(stateRoot, "stale-job.json"), JSON.stringify(stale));
    const manager = new RenderJobManager({ stateRoot, retentionMaxAgeMs: 1 });
    await manager.initialize();
    expect(manager.get("stale-job")).toBeUndefined();
    await expect(fs.access(path.join(stateRoot, "stale-job.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

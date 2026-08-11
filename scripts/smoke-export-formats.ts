import fs from "node:fs/promises";
import path from "node:path";
import type { RenderPreset } from "../shared/project.ts";
import { RenderJobManager, type RenderJob } from "../server/renderJobs.ts";
import { readProject } from "../server/projectStore.ts";

const projectId = "qa-keyframe-smoke";
const project = await readProject(projectId);
const sequenceId = project.activeSequenceId;
const manager = new RenderJobManager();

function waitFor(job: RenderJob): Promise<RenderJob> {
  return new Promise((resolve, reject) => {
    const unsubscribe = manager.subscribe(job.id, (state) => {
      if (state.stage === "complete") {
        unsubscribe?.();
        resolve(state);
      } else if (state.stage === "failed" || state.stage === "cancelled") {
        unsubscribe?.();
        reject(new Error(`${state.preset}: ${state.error || state.message}`));
      }
    });
    if (!unsubscribe) reject(new Error(`Render job ${job.id} was not registered.`));
  });
}

for (const preset of ["review", "gif", "webp", "png"] as RenderPreset[]) {
  const queued = await manager.create(projectId, sequenceId, preset);
  const completed = await waitFor(queued);
  if (!completed.outputFileName) throw new Error(`${preset}: missing output filename.`);
  const artifactPath = path.join(process.cwd(), "reel_projects", `${projectId}.hintsreel`, "renders", completed.outputFileName);
  const stat = await fs.stat(artifactPath);
  if (stat.size === 0) throw new Error(`${preset}: empty artifact.`);
  console.log(`${preset}: ${completed.outputFileName} (${stat.size} bytes)`);
}

console.log("Export matrix smoke passed: MP4, GIF, animated WebP, PNG sequence ZIP.");

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { RenderPreset } from "../shared/project.ts";

const execFileAsync = promisify(execFile);
const suppliedRoot = process.env.HRC_EXPORT_QUALIFICATION_ROOT;
const root = suppliedRoot ? path.resolve(suppliedRoot) : await fs.mkdtemp(path.join(os.tmpdir(), "hrc-export-matrix-"));
const projectsRoot = path.join(root, "projects");
process.env.HINTS_REEL_PROJECTS_DIR = projectsRoot;
if (suppliedRoot) await fs.rm(root, { recursive: true, force: true });
await fs.mkdir(root, { recursive: true });

const [{ createDefaultProject }, { RenderJobManager }, { writeProject }] = await Promise.all([
  import("../shared/project.ts"),
  import("../server/renderJobs.ts"),
  import("../server/projectStore.ts")
]);

const project = createDefaultProject("W4 Export Matrix");
project.id = `w4-export-${randomUUID()}`;
const sequence = project.sequences.find((candidate) => candidate.id === project.activeSequenceId)!;
sequence.width = 216;
sequence.height = 384;
sequence.fps = 12;
sequence.duration = 0.5;
sequence.background = "#04080c";
const graphicsTrack = sequence.tracks.find((track) => track.kind === "graphics")!;
graphicsTrack.clips.push({
  id: randomUUID(),
  trackId: graphicsTrack.id,
  kind: "shape",
  name: "Qualification Signal",
  timelineStart: 0,
  duration: sequence.duration,
  sourceIn: 0,
  playbackRate: 1,
  enabled: true,
  transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: "contain" },
  shape: { type: "rectangle", color: "#74f4ff", width: 120, height: 8 },
  audioGain: 1,
  fadeIn: 0.08,
  fadeOut: 0.08,
  keyframes: {
    x: [
      { id: randomUUID(), frame: 0, value: -35, easing: "ease-in-out" },
      { id: randomUUID(), frame: 5, value: 35, easing: "ease-in-out" }
    ]
  }
});
await writeProject(project, false);

const manager = new RenderJobManager({ stateRoot: path.join(root, "jobs"), concurrency: 1 });
await manager.initialize();

function waitFor(jobId: string): Promise<import("../server/renderJobs.ts").RenderJob> {
  return new Promise((resolve, reject) => {
    const unsubscribe = manager.subscribe(jobId, (state) => {
      if (state.stage === "complete") {
        unsubscribe?.();
        resolve(state);
      } else if (state.stage === "failed" || state.stage === "cancelled") {
        unsubscribe?.();
        reject(new Error(`${state.preset}: ${state.failureKind || "UNKNOWN"}: ${state.error || state.message}`));
      }
    });
    if (!unsubscribe) reject(new Error(`Render job ${jobId} was not registered.`));
  });
}

async function ffprobe(fileName: string): Promise<Array<{ codec_type?: string; codec_name?: string }>> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "json", fileName
  ], { maxBuffer: 4 * 1024 * 1024 });
  return (JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; codec_name?: string }> }).streams || [];
}

function assertCodec(streams: Array<{ codec_type?: string; codec_name?: string }>, type: string, codec: string): void {
  if (!streams.some((stream) => stream.codec_type === type && stream.codec_name === codec)) {
    throw new Error(`Expected ${type} codec ${codec}, received ${JSON.stringify(streams)}.`);
  }
}

const expectations: Record<RenderPreset, { video?: string; audio?: string; inspect?: "webp" | "png" }> = {
  draft: { video: "h264", audio: "aac" },
  review: { video: "h264", audio: "aac" },
  delivery: { video: "h264", audio: "aac" },
  archive: { video: "prores", audio: "pcm_s24le" },
  webm: { video: "vp9", audio: "opus" },
  gif: { video: "gif" },
  webp: { inspect: "webp" },
  png: { inspect: "png" }
};
const presets = Object.keys(expectations) as RenderPreset[];
const results: Array<Record<string, unknown>> = [];

for (const preset of presets) {
  const queued = await manager.create(project.id, sequence.id, preset);
  const completed = await waitFor(queued.id);
  if (!completed.outputFileName || !completed.provenanceFileName) throw new Error(`${preset}: output or provenance metadata missing.`);
  const outputPath = path.join(projectsRoot, `${project.id}.hintsreel`, "renders", completed.outputFileName);
  const provenancePath = path.join(projectsRoot, `${project.id}.hintsreel`, "renders", completed.provenanceFileName);
  const qaPath = path.join(projectsRoot, `${project.id}.hintsreel`, "qa", completed.id, "qa-report.json");
  const outputStats = await fs.stat(outputPath);
  const provenanceStats = await fs.stat(provenancePath);
  if (outputStats.size < 1 || provenanceStats.size < 1) throw new Error(`${preset}: empty output or provenance bundle.`);
  await fs.access(qaPath);

  const expectation = expectations[preset];
  if (expectation.inspect === "webp") {
    const { stdout } = await execFileAsync("magick", ["identify", "-format", "%m %n", outputPath]);
    if (!stdout.startsWith("WEBP ") || Number(stdout.split(/\s+/)[1]) < 2) throw new Error(`webp: animated inspection failed: ${stdout}`);
  } else if (expectation.inspect === "png") {
    const { stdout } = await execFileAsync("unzip", ["-Z1", outputPath]);
    if (!stdout.split("\n").some((entry) => entry.endsWith(".png"))) throw new Error("png: archive contains no PNG frames.");
  } else {
    const streams = await ffprobe(outputPath);
    if (expectation.video) assertCodec(streams, "video", expectation.video);
    if (expectation.audio) assertCodec(streams, "audio", expectation.audio);
  }
  results.push({
    preset,
    status: "PASS",
    jobId: completed.id,
    outputFileName: completed.outputFileName,
    bytes: outputStats.size,
    qaReport: qaPath,
    provenanceFileName: completed.provenanceFileName
  });
  console.log(`${preset}: PASS (${outputStats.size} bytes)`);
}

const report = {
  schema: "hints-export-qualification/v1",
  generatedAt: new Date().toISOString(),
  isolatedRoot: root,
  projectId: project.id,
  sourceProjectMutation: false,
  presets: results
};
const reportPath = path.join(root, "export-matrix-report.json");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Export matrix PASS: ${reportPath}`);

if (!suppliedRoot && process.env.HRC_EXPORT_KEEP !== "1") await fs.rm(root, { recursive: true, force: true });

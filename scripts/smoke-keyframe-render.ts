import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultProject, createMediaClip, createTextClip, type MediaAsset } from "../shared/project.ts";

function run(tool: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.split("\n").slice(-16).join("\n"))));
  });
}

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hrc-keyframe-smoke-"));
process.env.HINTS_REEL_PROJECTS_DIR = temporaryRoot;
const [{ compileRender, materializeRenderInputs }, { projectFile }] = await Promise.all([
  import("../server/renderCompiler.ts"),
  import("../server/paths.ts")
]);

try {
  const project = createDefaultProject("QA Keyframe Smoke");
  project.id = "qa-keyframe-smoke";
  project.updatedAt = "1970-01-01T00:00:00.000Z";
  project.sequences = [project.sequences[0]];
  const sequence = project.sequences[0];
  sequence.width = 360;
  sequence.height = 640;
  sequence.duration = 2;
  sequence.fps = 30;
  project.activeSequenceId = sequence.id;

  for (const folder of ["media", "proxies", "autosaves", "renders", "qa", "logs", "thumbnails", "waveforms"]) {
    await fs.mkdir(projectFile(project.id, folder), { recursive: true });
  }

  const sourceFileName = "keyframe-source.mp4";
  const sourcePath = projectFile(project.id, "media", sourceFileName);
  await run("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "testsrc2=s=180x320:r=30:d=2",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", sourcePath
  ]);
  const sourceBytes = await fs.readFile(sourcePath);
  const asset: MediaAsset = {
  id: "qa-keyframe-asset",
  name: "Keyframe source",
  kind: "video",
  fileName: sourceFileName,
  hash: createHash("sha256").update(sourceBytes).digest("hex"),
  duration: 2,
  width: 180,
  height: 320,
  fps: 30,
  hasAudio: false,
  createdAt: new Date().toISOString(),
    mediaUrl: `/api/v1/projects/${project.id}/assets/qa-keyframe-asset`
  };
  project.assets.push(asset);

  const videoTrack = sequence.tracks.find((track) => track.kind === "video")!;
  const media = createMediaClip(asset, videoTrack.id, 0);
media.duration = 2;
media.transform.scale = 0.72;
media.keyframes.x = [
  { id: "mx0", frame: 0, value: -72, easing: "linear" },
  { id: "mx1", frame: 59, value: 72, easing: "ease-in-out" }
];
media.keyframes.scale = [
  { id: "ms0", frame: 0, value: 0.72, easing: "linear" },
  { id: "ms1", frame: 59, value: 0.96, easing: "ease-out" }
];
media.keyframes.rotation = [
  { id: "mr0", frame: 0, value: -3, easing: "linear" },
  { id: "mr1", frame: 59, value: 3, easing: "ease-in-out" }
];
media.keyframes.opacity = [
  { id: "mo0", frame: 0, value: 0.2, easing: "linear" },
  { id: "mo1", frame: 20, value: 1, easing: "ease-out" }
];
  videoTrack.clips.push(media);

  const graphicsTrack = sequence.tracks.find((track) => track.kind === "graphics")!;
  const text = createTextClip(graphicsTrack.id, 0.15, 1.7);
text.text = "FRAME PARITY";
text.textStyle!.fontSize = 48;
text.keyframes.y = [
  { id: "ty0", frame: 0, value: 140, easing: "linear" },
  { id: "ty1", frame: 20, value: -130, easing: "ease-in-out" }
];
text.keyframes.opacity = [
  { id: "to0", frame: 0, value: 0, easing: "linear" },
  { id: "to1", frame: 12, value: 1, easing: "ease-out" }
];
  graphicsTrack.clips.push(text);

  await fs.writeFile(projectFile(project.id, "project.json"), `${JSON.stringify(project, null, 2)}\n`, "utf8");
  const compilation = compileRender(project, sequence, "draft", "keyframe-smoke");
  await fs.writeFile(projectFile(project.id, "logs", "keyframe-smoke-filtergraph.txt"), `${compilation.filterGraph}\n`, "utf8");
  await materializeRenderInputs(compilation);
  await run("ffmpeg", compilation.args);
  await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1", compilation.outputPath]);
  console.log(`Keyframe render smoke passed: ${path.relative(process.cwd(), compilation.outputPath)}`);
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const suppliedRoot = process.env.HRC_HEADLESS_QUALIFICATION_ROOT;
const root = suppliedRoot ? path.resolve(suppliedRoot) : await fs.mkdtemp(path.join(os.tmpdir(), "hrc-headless-"));
if (suppliedRoot) await fs.rm(root, { recursive: true, force: true });
await fs.mkdir(root, { recursive: true });
const projectsRoot = path.join(root, "projects");
const operationLog: Array<Record<string, unknown>> = [];

async function openPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate a local test port."));
      server.close(() => resolve(address.port));
    });
  });
}

interface ServerHandle {
  child: ChildProcess;
  output: () => string;
}

async function startServer(port: number): Promise<ServerHandle> {
  let output = "";
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "development", PORT: String(port), HINTS_REEL_PROJECTS_DIR: projectsRoot },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => { output += chunk; });
  child.stderr?.on("data", (chunk: string) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Composer server exited early.\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.ok) return { child, output: () => output };
    } catch {
      // Wait for the local server to finish startup.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  child.kill("SIGTERM");
  throw new Error(`Composer server did not become healthy.\n${output}`);
}

async function stopServer(handle: ServerHandle, label: string): Promise<void> {
  if (handle.child.exitCode === null) handle.child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => handle.child.once("close", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000))
  ]);
  await fs.writeFile(path.join(root, `${label}-server.log`), handle.output(), "utf8");
}

async function cli(baseUrl: string, args: string[]): Promise<unknown> {
  const startedAt = new Date().toISOString();
  const { stdout, stderr } = await execFileAsync(process.execPath, ["--import", "tsx", "scripts/hrc.ts", ...args, "--url", baseUrl, "--json"], {
    cwd: process.cwd(), maxBuffer: 16 * 1024 * 1024
  });
  if (stderr.trim()) operationLog.push({ startedAt, args, stderr: stderr.trim() });
  const result = JSON.parse(stdout.trim());
  operationLog.push({ startedAt, args, result });
  return result;
}

async function sha256(fileName: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(fileName)).digest("hex");
}

const sourceMedia = path.join(root, "source.mp4");
await execFileAsync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "color=c=#07131a:s=216x384:r=12:d=1",
  "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
  "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", sourceMedia
]);
const sourceHashBefore = await sha256(sourceMedia);
const port = await openPort();
const baseUrl = `http://127.0.0.1:${port}`;
let server = await startServer(port);

try {
  const created = await cli(baseUrl, ["create", "--title", "W4 Headless Qualification"]) as { id: string };
  const imported = await cli(baseUrl, ["import", "--project", created.id, "--file", sourceMedia]) as {
    asset: { id: string; kind: string };
    proxy?: { project?: { assets?: Array<{ id: string; proxyUrl?: string; proxySourceHash?: string }> } };
  };
  const proxiedAsset = imported.proxy?.project?.assets?.find((asset) => asset.id === imported.asset.id);
  if (!proxiedAsset?.proxyUrl || !proxiedAsset.proxySourceHash) throw new Error("Headless media import did not establish a source-bound preview proxy.");

  const project = await cli(baseUrl, ["get", "--project", created.id]) as import("../shared/project.ts").ReelProject;
  const sequence = project.sequences.find((candidate) => candidate.id === project.activeSequenceId)!;
  sequence.width = 216;
  sequence.height = 384;
  sequence.fps = 12;
  sequence.duration = 1;
  const videoTrack = sequence.tracks.find((track) => track.kind === "video")!;
  videoTrack.clips.push({
    id: randomUUID(), trackId: videoTrack.id, kind: "media", name: "Headless Source",
    assetId: imported.asset.id, timelineStart: 0, duration: 1, sourceIn: 0, playbackRate: 1, enabled: true,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: "cover" },
    audioGain: 0.5, fadeIn: 0.1, fadeOut: 0.1, keyframes: {}
  });
  const graphicsTrack = sequence.tracks.find((track) => track.kind === "graphics")!;
  graphicsTrack.clips.push({
    id: randomUUID(), trackId: graphicsTrack.id, kind: "shape", name: "Signal",
    timelineStart: 0.15, duration: 0.7, sourceIn: 0, playbackRate: 1, enabled: true,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.9, fit: "contain" },
    shape: { type: "line", color: "#74f4ff", width: 160, height: 3 },
    audioGain: 1, fadeIn: 0.1, fadeOut: 0.1,
    keyframes: { x: [
      { id: randomUUID(), frame: 0, value: -70, easing: "ease-in-out" },
      { id: randomUUID(), frame: 8, value: 70, easing: "ease-in-out" }
    ] }
  });
  const recipePath = path.join(root, "headless-qualification.hints-reel.json");
  await fs.writeFile(recipePath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  const validation = await cli(baseUrl, ["validate", "--file", recipePath]) as { valid: boolean };
  if (!validation.valid) throw new Error("Headless qualification Recipe failed validation.");
  await cli(baseUrl, ["recipe", "apply", "--project", created.id, "--file", recipePath]);

  const malformed = await fetch(`${baseUrl}/api/v1/renders`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: "../bad", preset: "unknown" })
  });
  if (malformed.status !== 400) throw new Error(`Malformed render request returned ${malformed.status}, expected 400.`);

  const completed = await cli(baseUrl, [
    "render", "--project", created.id, "--sequence", sequence.id, "--preset", "review", "--wait", "--timeout", "120"
  ]) as { id: string; stage: string; outputFileName?: string; provenanceFileName?: string };
  if (completed.stage !== "complete") throw new Error(`Headless render ended in ${completed.stage}.`);
  const qa = await cli(baseUrl, ["qa", "--job", completed.id]) as { report?: { checks?: Record<string, unknown> } };
  if (!qa.report?.checks) throw new Error("Headless QA report was not retrievable.");
  const outputPath = path.join(root, "retrieved-review.mp4");
  const provenancePath = path.join(root, "retrieved-provenance.zip");
  await cli(baseUrl, ["output", "--job", completed.id, "--out", outputPath]);
  await cli(baseUrl, ["provenance", "--job", completed.id, "--out", provenancePath]);
  if ((await fs.stat(outputPath)).size < 1 || (await fs.stat(provenancePath)).size < 1) throw new Error("Headless artifact retrieval returned an empty file.");

  await stopServer(server, "first-run");
  server = await startServer(port);
  const recovered = await cli(baseUrl, ["status", "--job", completed.id]) as { stage: string; outputFileName?: string };
  if (recovered.stage !== "complete" || recovered.outputFileName !== completed.outputFileName) {
    throw new Error("Persisted complete job was not recovered after restart.");
  }
  if (await sha256(sourceMedia) !== sourceHashBefore) throw new Error("Source media changed during headless operation.");

  const report = {
    schema: "hints-headless-qualification/v1",
    generatedAt: new Date().toISOString(),
    status: "PASS",
    projectId: created.id,
    renderJobId: completed.id,
    sourceHash: sourceHashBefore,
    proxySourceHash: proxiedAsset.proxySourceHash,
    output: outputPath,
    provenance: provenancePath,
    restartRecoveredStage: recovered.stage,
    malformedRequestStatus: malformed.status,
    guiRequired: false,
    externalProviderRequired: false
  };
  await fs.writeFile(path.join(root, "headless-qualification-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Headless operations PASS: ${path.join(root, "headless-qualification-report.json")}`);
} finally {
  await stopServer(server, "final-run").catch(() => undefined);
  await fs.writeFile(path.join(root, "agent-operation-log.json"), `${JSON.stringify(operationLog, null, 2)}\n`, "utf8");
  if (!suppliedRoot && process.env.HRC_HEADLESS_KEEP !== "1") await fs.rm(root, { recursive: true, force: true });
}

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createDefaultProject,
  createMediaClip,
  createTextClip,
  type AspectRatio,
  type MediaAsset,
  type ReelClip,
  type ReelProject
} from "../shared/project.ts";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface CdpMessage {
  id?: number;
  result?: unknown;
  error?: { message: string };
}

interface ParityResult {
  ratio: AspectRatio;
  rmse: number;
  previewSize: string;
  exportSize: string;
}

const chromePath = "/usr/bin/google-chrome-stable";
const fixtureTime = 1;

function run(tool: string, args: string[], acceptedCodes = new Set([0])): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      const normalized = code ?? -1;
      if (acceptedCodes.has(normalized)) resolve({ code: normalized, stdout, stderr });
      else reject(new Error(`${tool} exited ${normalized}:\n${stderr.split("\n").slice(-24).join("\n")}`));
    });
  });
}

async function waitForUrl(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 1500))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

class CdpClient {
  private socket: WebSocket;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id === undefined) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    });
  }

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => resolve(new CdpClient(socket)), { once: true });
      socket.addEventListener("error", () => reject(new Error("Chrome DevTools websocket failed.")), { once: true });
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    this.socket.close();
  }
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

async function createFixture(root: string, ratio: AspectRatio): Promise<{ project: ReelProject; outputPath: string }> {
  process.env.HINTS_REEL_PROJECTS_DIR = root;
  const [{ compileRender, materializeRenderInputs }] = await Promise.all([import("../server/renderCompiler.ts")]);
  const project = createDefaultProject(`Parity ${ratio}`);
  project.id = `parity-${ratio.replace(":", "x")}`;
  const sequence = project.sequences.find((candidate) => candidate.aspectRatio === ratio)!;
  project.sequences = [sequence];
  project.activeSequenceId = sequence.id;
  sequence.width = ratio === "9:16" ? 270 : 480;
  sequence.height = ratio === "9:16" ? 480 : 270;
  sequence.duration = 2;
  sequence.fps = 30;
  sequence.background = "#04080c";

  const projectRoot = path.join(root, `${project.id}.hintsreel`);
  for (const folder of ["media", "proxies", "thumbnails", "waveforms", "autosaves", "renders", "qa", "logs"]) {
    await fs.mkdir(path.join(projectRoot, folder), { recursive: true });
  }

  const mediaName = "parity-source.mp4";
  const mediaPath = path.join(projectRoot, "media", mediaName);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=s=${sequence.width}x${sequence.height}:r=30:d=2.5`,
    "-c:v", "libx264", "-crf", "8", "-pix_fmt", "yuv420p", mediaPath
  ]);
  const bytes = await fs.readFile(mediaPath);
  const asset: MediaAsset = {
    id: "parity-media",
    name: "Parity source",
    kind: "video",
    role: "source-media",
    fileName: mediaName,
    hash: createHash("sha256").update(bytes).digest("hex"),
    duration: 2.5,
    width: sequence.width,
    height: sequence.height,
    fps: 30,
    hasAudio: false,
    createdAt: "2026-08-11T00:00:00.000Z",
    mediaUrl: `/api/v1/projects/${project.id}/assets/parity-media`,
    provenance: "Locally generated deterministic parity fixture"
  };
  project.assets.push(asset);

  const videoTrack = sequence.tracks.find((track) => track.kind === "video")!;
  const graphicsTracks = sequence.tracks.filter((track) => track.kind === "graphics").sort((a, b) => a.order - b.order);
  videoTrack.solo = true;
  graphicsTracks.forEach((track) => { track.solo = true; });
  const media = createMediaClip(asset, videoTrack.id, 0.2);
  media.duration = 1.6;
  media.sourceIn = 0.25;
  media.fadeIn = 0.2;
  media.fadeOut = 0.2;
  media.transform = { x: -8, y: 6, scale: 0.82, rotation: 3, opacity: 0.88, fit: "cover" };
  media.keyframes.x = [
    { id: "media-x-0", frame: 0, value: -18, easing: "linear" },
    { id: "media-x-1", frame: 47, value: 14, easing: "ease-in-out" }
  ];
  videoTrack.clips.push(media);

  const shape: ReelClip = {
    id: "parity-shape", trackId: graphicsTracks[0].id, kind: "shape", name: "Signal",
    timelineStart: 0.15, duration: 1.7, sourceIn: 0, playbackRate: 1, enabled: true,
    transform: { x: 6, y: ratio === "9:16" ? 126 : 74, scale: 1, rotation: -2, opacity: 0.9, fit: "contain" },
    shape: { type: "line", color: "#74f4ff", width: sequence.width * 0.62, height: even(sequence.width / 90) },
    audioGain: 1, fadeIn: 0.18, fadeOut: 0.2,
    keyframes: {
      scale: [
        { id: "shape-scale-0", frame: 0, value: 0.35, easing: "linear" },
        { id: "shape-scale-1", frame: 30, value: 1, easing: "ease-out" }
      ],
      rotation: [
        { id: "shape-rotation-0", frame: 0, value: -4, easing: "linear" },
        { id: "shape-rotation-1", frame: 45, value: 2, easing: "ease-in-out" }
      ]
    }
  };
  graphicsTracks[0].clips.push(shape);

  const text = createTextClip(graphicsTracks[1].id, 0.1, 1.8);
  text.id = "parity-text";
  text.text = ratio === "9:16" ? "إشارة واحدة\nONE SIGNAL" : "ONE SIGNAL\nإشارة واحدة";
  text.textStyle!.fontFamily = "Tajawal";
  text.textStyle!.fontSize = 66;
  text.textStyle!.lineHeight = 1.25;
  text.textStyle!.direction = ratio === "9:16" ? "rtl" : "ltr";
  text.textStyle!.align = ratio === "9:16" ? "right" : "left";
  text.transform.y = ratio === "9:16" ? -126 : -72;
  text.transform.rotation = 1.5;
  text.fadeIn = 0.2;
  text.fadeOut = 0.2;
  text.keyframes.opacity = [
    { id: "text-opacity-0", frame: 0, value: 0.2, easing: "linear" },
    { id: "text-opacity-1", frame: 18, value: 1, easing: "ease-out" }
  ];
  graphicsTracks[1].clips.push(text);

  const hiddenTrack = sequence.tracks.find((track) => track.kind === "audio")!;
  hiddenTrack.hidden = true;
  hiddenTrack.muted = true;
  const disabled = structuredClone(shape);
  disabled.id = "disabled-shape";
  disabled.trackId = graphicsTracks[0].id;
  disabled.enabled = false;
  disabled.shape!.color = "#ff0000";
  disabled.keyframes = {};
  graphicsTracks[0].clips.push(disabled);

  project.updatedAt = ratio === "9:16" ? "2026-08-11T00:00:00.000Z" : "2026-08-11T00:00:01.000Z";
  await fs.writeFile(path.join(projectRoot, "project.json"), `${JSON.stringify(project, null, 2)}\n`, "utf8");
  const compilation = compileRender(project, sequence, "draft", `parity-${ratio.replace(":", "x")}`);
  await materializeRenderInputs(compilation);
  await run("ffmpeg", compilation.args);
  return { project, outputPath: compilation.outputPath };
}

async function capturePreview(baseUrl: string, cdpPort: number, destination: string): Promise<{ width: number; height: number }> {
  const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" }).then((response) => response.json()) as { webSocketDebuggerUrl: string };
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const state = await client.send("Runtime.evaluate", {
        expression: "Boolean(document.querySelector('.preview-stage')) && !document.querySelector('.app-loader')",
        returnByValue: true
      }) as { result?: { value?: boolean } };
      if (state.result?.value) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await client.send("Runtime.evaluate", {
      expression: `document.querySelectorAll('.timeline-ruler button')[${fixtureTime}]?.click(); true`,
      returnByValue: true
    });
    await new Promise((resolve) => setTimeout(resolve, 900));
    await client.send("Runtime.evaluate", {
      expression: `(() => {
        const style = document.createElement('style');
        style.textContent = '.safe-area,.center-guide,.selection-frame{display:none!important}';
        document.head.appendChild(style);
        return true;
      })()`,
      returnByValue: true
    });
    const geometry = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const rect = document.querySelector('.preview-stage').getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })()`,
      returnByValue: true
    }) as { result?: { value?: { x: number; y: number; width: number; height: number } } };
    const rect = geometry.result?.value;
    if (!rect || rect.width < 40 || rect.height < 40) throw new Error("Preview stage did not produce a capturable rectangle.");
    const capture = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 }
    }) as { data?: string };
    if (!capture.data) throw new Error("Chrome did not return preview screenshot data.");
    await fs.writeFile(destination, Buffer.from(capture.data, "base64"));
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  } finally {
    client.close();
  }
}

function parseRmse(output: string): number {
  const match = output.match(/\((\d+(?:\.\d+)?)\)/);
  if (!match) throw new Error(`Could not parse ImageMagick RMSE: ${output}`);
  return Number(match[1]);
}

async function verifyRatio(programRoot: string, ratio: AspectRatio, offset: number): Promise<ParityResult> {
  const artifactRoot = path.join(programRoot, `artifacts-${ratio.replace(":", "x")}`);
  await fs.mkdir(artifactRoot, { recursive: true });
  const { outputPath } = await createFixture(programRoot, ratio);
  const port = 12190 + offset;
  const cdpPort = 13190 + offset;
  const serverLog: string[] = [];
  const server = spawn("node", ["server-dist/server/index.js"], {
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."),
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), HINTS_REEL_PROJECTS_DIR: programRoot },
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout?.on("data", (chunk) => serverLog.push(String(chunk)));
  server.stderr?.on("data", (chunk) => serverLog.push(String(chunk)));
  const chromeRoot = path.join(artifactRoot, "chrome");
  const chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${chromeRoot}`,
    "--window-size=1600,1200", "about:blank"
  ], { stdio: ["ignore", "ignore", "pipe"] });
  try {
    await Promise.all([
      waitForUrl(`http://127.0.0.1:${port}/api/v1/health`),
      waitForUrl(`http://127.0.0.1:${cdpPort}/json/version`)
    ]);
    const previewPath = path.join(artifactRoot, "preview.png");
    const previewSize = await capturePreview(`http://127.0.0.1:${port}`, cdpPort, previewPath);
    const exportFrame = path.join(artifactRoot, "export.png");
    const exportScaled = path.join(artifactRoot, "export-scaled.png");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(fixtureTime), "-i", outputPath, "-frames:v", "1", exportFrame]);
    await run("magick", [exportFrame, "-filter", "Lanczos", "-resize", `${previewSize.width}x${previewSize.height}!`, exportScaled]);
    const comparison = await run("magick", ["compare", "-metric", "RMSE", previewPath, exportScaled, "null:"], new Set([0, 1]));
    const rmse = parseRmse(`${comparison.stdout}\n${comparison.stderr}`);
    if (rmse > 0.24) throw new Error(`${ratio} preview/export RMSE ${rmse.toFixed(6)} exceeded 0.24.`);
    return {
      ratio,
      rmse,
      previewSize: `${previewSize.width}x${previewSize.height}`,
      exportSize: ratio === "9:16" ? "270x480" : "480x270"
    };
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nServer log:\n${serverLog.join("")}`);
  } finally {
    await Promise.all([stopProcess(chrome), stopProcess(server)]);
  }
}

const programRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hrc-parity-"));
try {
  await fs.access(chromePath);
  const results: ParityResult[] = [];
  for (const [index, ratio] of (["9:16", "16:9"] as AspectRatio[]).entries()) {
    results.push(await verifyRatio(programRoot, ratio, index));
  }
  for (const result of results) {
    console.log(`${result.ratio}: preview ${result.previewSize}, export ${result.exportSize}, normalized RMSE ${result.rmse.toFixed(6)}`);
  }
  console.log("Preview/export golden parity passed for media, explicit multiline RTL/LTR text, signal shape, transforms, fades, keyframes, visibility, solo, disabled clips, and two ratios.");
} finally {
  await fs.rm(programRoot, { recursive: true, force: true });
}

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import type { MediaAsset, ReelClip, ReelProject, ReelSequence, ReelTrack } from "../shared/project.ts";

const execFileAsync = promisify(execFile);
const composerRoot = process.cwd();
const studioRoot = path.resolve(composerRoot, "..");
const suppliedRoot = process.env.HRC_PRODUCTION_QUALIFICATION_ROOT;
const root = suppliedRoot ? path.resolve(suppliedRoot) : await fs.mkdtemp(path.join(os.tmpdir(), "hrc-production-qualification-"));
if (suppliedRoot) await fs.rm(root, { recursive: true, force: true });
await fs.mkdir(root, { recursive: true });
const projectsRoot = path.join(root, "projects");
const sourcesRoot = path.join(root, "source");
await fs.mkdir(sourcesRoot, { recursive: true });
const operations: Array<Record<string, unknown>> = [];

async function fileHash(fileName: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(fileName)).digest("hex");
}

async function treeFingerprint(rootPath: string, include: (relative: string) => boolean): Promise<string> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(rootPath, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && include(relative)) files.push(relative);
    }
  }
  try { await visit(rootPath); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const digest = createHash("sha256");
  for (const relative of files.sort()) {
    digest.update(relative).update("\0").update(await fs.readFile(path.join(rootPath, relative))).update("\0");
  }
  return digest.digest("hex");
}

const sourceDirectories = ["src/", "shared/", "server/", "scripts/", "tests/", "docs/"];
const sourceRootFiles = new Set(["README.md", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.server.json", "vite.config.ts", "index.html", "start-reel-composer.sh"]);
const sourceFingerprint = () => treeFingerprint(composerRoot, (relative) => sourceRootFiles.has(relative) || sourceDirectories.some((prefix) => relative.startsWith(prefix)));
const founderProjectsFingerprint = () => treeFingerprint(path.join(composerRoot, "reel_projects"), () => true);
const composerSourceBefore = await sourceFingerprint();
const founderProjectsBefore = await founderProjectsFingerprint();

const authorityFile = path.join(studioRoot, "brand_canon", "identity_authority.json");
const authority = JSON.parse(await fs.readFile(authorityFile, "utf8")) as { motion_reference?: string };
if (authority.motion_reference !== "brand identity/h_window_2026-07-11T08-42-52-713Z.webm") {
  throw new Error("Canonical identity authority does not name the expected official motion reference.");
}
await execFileAsync(process.execPath, [path.join(studioRoot, "scripts", "check_identity_authority.mjs")], { cwd: studioRoot });
const officialMotion = path.join(studioRoot, authority.motion_reference);
const officialMotionHashBefore = await fileHash(officialMotion);

const architectureImage = path.join(sourcesRoot, "signal-architecture.png");
const apertureImage = path.join(sourcesRoot, "controlled-aperture.png");
const plateA = path.join(sourcesRoot, "signal-field-a.mp4");
const plateB = path.join(sourcesRoot, "signal-field-b.mp4");
const soundBed = path.join(sourcesRoot, "signal-pressure-bed.wav");

await execFileAsync("magick", [
  "-size", "1080x1920", "gradient:#04080c-#0b2730",
  "-fill", "rgba(7,19,26,0.88)", "-draw", "rectangle 72,180 292,1760 rectangle 340,340 510,1600 rectangle 570,250 810,1680 rectangle 855,460 1008,1500",
  "-stroke", "rgba(46,217,233,0.34)", "-strokewidth", "3", "-fill", "none",
  "-draw", "line 0,1280 1080,1280 line 292,1760 340,1600 line 510,1600 570,1680 line 810,1680 855,1500",
  "-blur", "0x0.35", architectureImage
]);
await execFileAsync("magick", [
  "-size", "1080x1920", "gradient:#04080c-#07131a",
  "-fill", "rgba(35,55,255,0.30)", "-draw", "rectangle 80,520 1000,1400",
  "-fill", "rgba(93,242,222,0.42)", "-draw", "rectangle 80,520 330,1400",
  "-fill", "rgba(41,111,247,0.36)", "-draw", "rectangle 330,520 760,1400",
  "-stroke", "rgba(116,244,255,0.48)", "-strokewidth", "4", "-fill", "none", "-draw", "rectangle 80,520 1000,1400",
  "-blur", "0x1.4", apertureImage
]);
await execFileAsync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", architectureImage,
  "-vf", "zoompan=z='min(zoom+0.0007,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=1080x1920:fps=30,format=yuv420p",
  "-frames:v", "180", "-c:v", "libx264", "-preset", "fast", "-crf", "16", plateA
]);
await execFileAsync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", apertureImage,
  "-vf", "zoompan=z='min(zoom+0.0005,1.05)':x='max(0,min(iw-iw/zoom,(iw-iw/zoom)/2+20*sin(on/28)))':y='ih/2-(ih/zoom/2)':d=150:s=1080x1920:fps=30,format=yuv420p",
  "-frames:v", "150", "-c:v", "libx264", "-preset", "fast", "-crf", "16", plateB
]);
await execFileAsync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "sine=frequency=58:sample_rate=48000:duration=18",
  "-f", "lavfi", "-i", "anoisesrc=color=pink:sample_rate=48000:duration=18:amplitude=0.02",
  "-filter_complex", "[0:a]volume=0.11,lowpass=f=180[a0];[1:a]volume=0.06,lowpass=f=900[a1];[a0][a1]amix=inputs=2:duration=longest:normalize=0,afade=t=in:st=0:d=1,afade=t=out:st=16:d=2[a]",
  "-map", "[a]", "-c:a", "pcm_s24le", soundBed
]);

const sourceFiles = [architectureImage, apertureImage, plateA, plateB, soundBed, officialMotion];
const sourceHashesBefore = Object.fromEntries(await Promise.all(sourceFiles.map(async (fileName) => [fileName, await fileHash(fileName)])));

async function openPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate qualification port."));
      listener.close(() => resolve(address.port));
    });
  });
}

interface ServerHandle { child: ChildProcess; output: () => string }

async function startServer(port: number): Promise<ServerHandle> {
  let output = "";
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: composerRoot,
    env: { ...process.env, NODE_ENV: "development", PORT: String(port), HINTS_REEL_PROJECTS_DIR: projectsRoot },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => { output += chunk; });
  child.stderr?.on("data", (chunk: string) => { output += chunk; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Qualification server exited early.\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.ok) return { child, output: () => output };
    } catch {
      // Wait for local startup.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  child.kill("SIGTERM");
  throw new Error(`Qualification server did not become healthy.\n${output}`);
}

async function stopServer(handle: ServerHandle, label: string): Promise<void> {
  if (handle.child.exitCode === null) handle.child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => handle.child.once("close", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 8_000))
  ]);
  await fs.writeFile(path.join(root, `${label}-server.log`), handle.output(), "utf8");
}

const { runCli } = await import("./hrc.ts");
const port = await openPort();
const baseUrl = `http://127.0.0.1:${port}`;
let server = await startServer(port);

async function cli(args: string[]): Promise<unknown> {
  let stdout = "";
  let stderr = "";
  const startedAt = new Date().toISOString();
  const exitCode = await runCli([...args, "--url", baseUrl, "--json"], {
    write: (value) => { stdout += value; },
    writeError: (value) => { stderr += value; }
  });
  operations.push({ startedAt, args, exitCode, stdout: stdout.trim(), stderr: stderr.trim() });
  if (exitCode !== 0) throw new Error(stderr.trim() || `HRC command failed: ${args.join(" ")}`);
  return JSON.parse(stdout.trim());
}

async function importAsset(projectId: string, fileName: string, role = "source-media"): Promise<MediaAsset> {
  const result = await cli(["import", "--project", projectId, "--file", fileName, "--role", role]) as { asset: MediaAsset };
  return result.asset;
}

function track(sequence: ReelSequence, kind: ReelTrack["kind"], index = 0): ReelTrack {
  const found = sequence.tracks.filter((candidate) => candidate.kind === kind)[index];
  if (!found) throw new Error(`Missing ${kind} track ${index}.`);
  return found;
}

function mediaClip(asset: MediaAsset, trackId: string, start: number, duration: number, fit: "cover" | "contain" = "cover"): ReelClip {
  return {
    id: randomUUID(), trackId, kind: "media", name: asset.name, assetId: asset.id,
    timelineStart: start, duration, sourceIn: 0, playbackRate: 1, enabled: true,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit },
    audioGain: 1, fadeIn: 0.35, fadeOut: 0.35, keyframes: {}
  };
}

function signalClip(trackId: string, start: number, duration: number, width: number, fps = 30): ReelClip {
  return {
    id: randomUUID(), trackId, kind: "shape", name: "Controlled Signal",
    timelineStart: start, duration, sourceIn: 0, playbackRate: 1, enabled: true,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.92, fit: "contain" },
    shape: { type: "line", color: "#74f4ff", width, height: 3 },
    audioGain: 1, fadeIn: 0.2, fadeOut: 0.25,
    keyframes: { x: [
      { id: randomUUID(), frame: 0, value: -460, easing: "ease-in-out" },
      { id: randomUUID(), frame: Math.round(duration * fps), value: 460, easing: "ease-in-out" }
    ] }
  };
}

function textClip(trackId: string, start: number, duration: number, text: string, direction: "ltr" | "rtl", y: number): ReelClip {
  return {
    id: randomUUID(), trackId, kind: "text", name: direction === "rtl" ? "Arabic Signal Copy" : "Signal Copy",
    timelineStart: start, duration, sourceIn: 0, playbackRate: 1, enabled: true,
    transform: { x: 0, y, scale: 1, rotation: 0, opacity: 1, fit: "contain" },
    text,
    textStyle: {
      fontFamily: direction === "rtl" ? "Tajawal" : "Bomstad Display", fontWeight: 700, fontSize: direction === "rtl" ? 68 : 76,
      lineHeight: 1.12, letterSpacing: 0, color: "#ffffff", align: "center", direction,
      strokeColor: "#04080c", strokeWidth: 2, shadowColor: "#04080c", shadowBlur: 14
    },
    audioGain: 1, fadeIn: 0.4, fadeOut: 0.45,
    keyframes: { y: [
      { id: randomUUID(), frame: 0, value: y + 28, easing: "ease-out" },
      { id: randomUUID(), frame: 18, value: y, easing: "ease-out" }
    ] }
  };
}

let qualificationResult: Record<string, unknown> | undefined;
try {
  const created = await cli(["create", "--title", "Hints Signal Field Production Qualification"]) as ReelProject;
  const importedPlateA = await importAsset(created.id, plateA);
  const importedStill = await importAsset(created.id, apertureImage);
  const importedPlateB = await importAsset(created.id, plateB);
  const importedAudio = await importAsset(created.id, soundBed);
  const importedIdentity = await importAsset(created.id, officialMotion, "official-brand-motion");
  const project = await cli(["get", "--project", created.id]) as ReelProject;
  project.renderSettings.normalizeAudio = true;
  project.renderSettings.loudnessTarget = -16;
  project.renderSettings.truePeak = -1;

  const primary = project.sequences.find((sequence) => sequence.aspectRatio === "9:16")!;
  primary.width = 1080;
  primary.height = 1920;
  primary.fps = 30;
  primary.duration = 18;
  primary.background = "#04080c";
  for (const candidate of primary.tracks) candidate.clips = [];
  const primaryVideo = track(primary, "video");
  const primaryGraphics = track(primary, "graphics", 0);
  const primarySignal = track(primary, "graphics", 1);
  const primaryAudio = track(primary, "audio", 0);
  const opening = mediaClip(importedPlateA, primaryVideo.id, 0, 6.2);
  opening.keyframes = { scale: [
    { id: randomUUID(), frame: 0, value: 1, easing: "ease-in-out" },
    { id: randomUUID(), frame: 186, value: 1.06, easing: "ease-in-out" }
  ] };
  const aperture = mediaClip(importedStill, primaryVideo.id, 5.8, 4.6);
  aperture.keyframes = { scale: [
    { id: randomUUID(), frame: 0, value: 1, easing: "ease-in-out" },
    { id: randomUUID(), frame: 138, value: 1.1, easing: "ease-in-out" }
  ] };
  const resolution = mediaClip(importedPlateB, primaryVideo.id, 10, 4.3);
  resolution.transform.scale = 1.02;
  resolution.keyframes = { x: [
    { id: randomUUID(), frame: 0, value: -24, easing: "ease-in-out" },
    { id: randomUUID(), frame: 129, value: 24, easing: "ease-in-out" }
  ] };
  const identity = mediaClip(importedIdentity, primaryVideo.id, 14, 4, "contain");
  identity.transform.scale = 0.92;
  identity.fadeIn = 0.25;
  identity.fadeOut = 0;
  primaryVideo.clips.push(opening, aperture, resolution, identity);
  primarySignal.clips.push(signalClip(primarySignal.id, 1.2, 4.5, 940));
  primaryGraphics.clips.push(
    textClip(primaryGraphics.id, 1.65, 3.9, "CLARITY MOVES\nWITH ONE SIGNAL.", "ltr", 470),
    textClip(primaryGraphics.id, 6.3, 3.5, "الوضوح يبدأ بإشارة واحدة", "rtl", 430),
    textClip(primaryGraphics.id, 10.65, 2.8, "CONTROLLED DISCOVERY", "ltr", 500)
  );
  const bed = mediaClip(importedAudio, primaryAudio.id, 0, 18, "contain");
  bed.audioGain = 0.72;
  bed.fadeIn = 1;
  bed.fadeOut = 2;
  primaryAudio.clips.push(bed);

  const alternate = project.sequences.find((sequence) => sequence.aspectRatio === "16:9")!;
  alternate.width = 1920;
  alternate.height = 1080;
  alternate.fps = 30;
  alternate.duration = 18;
  alternate.background = "#04080c";
  for (const candidate of alternate.tracks) candidate.clips = [];
  const alternateVideo = track(alternate, "video");
  const alternateGraphics = track(alternate, "graphics", 0);
  const alternateSignal = track(alternate, "graphics", 1);
  const alternateAudio = track(alternate, "audio", 0);
  alternateVideo.clips.push(
    mediaClip(importedPlateA, alternateVideo.id, 0, 7, "cover"),
    mediaClip(importedPlateB, alternateVideo.id, 6.7, 7.6, "cover"),
    mediaClip(importedIdentity, alternateVideo.id, 14, 4, "contain")
  );
  alternateSignal.clips.push(signalClip(alternateSignal.id, 1.2, 4.5, 1520));
  alternateGraphics.clips.push(textClip(alternateGraphics.id, 1.7, 3.8, "CLARITY MOVES WITH ONE SIGNAL.", "ltr", 260));
  const alternateBed = mediaClip(importedAudio, alternateAudio.id, 0, 18, "contain");
  alternateBed.audioGain = 0.72;
  alternateBed.fadeIn = 1;
  alternateBed.fadeOut = 2;
  alternateAudio.clips.push(alternateBed);

  const recoverySequence = project.sequences.find((sequence) => sequence.aspectRatio === "1:1")!;
  recoverySequence.width = 540;
  recoverySequence.height = 540;
  recoverySequence.fps = 24;
  recoverySequence.duration = 8;
  recoverySequence.background = "#04080c";
  for (const candidate of recoverySequence.tracks) candidate.clips = [];
  const recoverySignal = track(recoverySequence, "graphics", 1);
  recoverySignal.clips.push(signalClip(recoverySignal.id, 0, 8, 460, recoverySequence.fps));

  project.activeSequenceId = primary.id;
  const stagedRecipe = path.join(root, "qualification-staged.hints-reel.json");
  await fs.writeFile(stagedRecipe, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  const validation = await cli(["validate", "--file", stagedRecipe]) as { valid: boolean; errors?: string[] };
  if (!validation.valid) throw new Error(`Qualification Recipe invalid: ${validation.errors?.join(" ")}`);
  await cli(["recipe", "apply", "--project", project.id, "--file", stagedRecipe]);
  const canonicalRecipe = path.join(root, "qualification-final.hints-reel.json");
  await cli(["recipe", "export", "--project", project.id, "--out", canonicalRecipe]);

  async function renderAndRetrieve(sequenceId: string, preset: "draft" | "review" | "delivery", label: string): Promise<{ job: Record<string, unknown>; output: string; provenance: string }> {
    const job = await cli(["render", "--project", project.id, "--sequence", sequenceId, "--preset", preset, "--wait", "--timeout", "900"]) as Record<string, unknown>;
    if (job.stage !== "complete") throw new Error(`${label} render did not complete.`);
    const qa = await cli(["qa", "--job", String(job.id)]) as { report?: { checks?: Record<string, unknown> } };
    if (!qa.report?.checks) throw new Error(`${label} QA report unavailable.`);
    const output = path.join(root, `${label}.${preset === "draft" || preset === "review" || preset === "delivery" ? "mp4" : "bin"}`);
    const provenance = path.join(root, `${label}-provenance.zip`);
    await cli(["output", "--job", String(job.id), "--out", output]);
    await cli(["provenance", "--job", String(job.id), "--out", provenance]);
    return { job, output, provenance };
  }

  const review = await renderAndRetrieve(primary.id, "review", "hints-signal-field-review");
  const delivery = await renderAndRetrieve(primary.id, "delivery", "hints-signal-field-delivery");
  const alternateOutput = await renderAndRetrieve(alternate.id, "draft", "hints-signal-field-16x9-draft");

  const blocker = await cli(["render", "--project", project.id, "--sequence", primary.id, "--preset", "delivery"]) as { id: string };
  const disposable = await cli(["render", "--project", project.id, "--sequence", recoverySequence.id, "--preset", "draft"]) as { id: string };
  await stopServer(server, "pre-restart");
  server = await startServer(port);
  const blockerAfterRestart = await cli(["status", "--job", blocker.id]) as { stage: string };
  if (!["cancelled", "failed"].includes(blockerAfterRestart.stage)) throw new Error(`Active blocker recovered as ${blockerAfterRestart.stage}.`);
  const interrupted = await cli(["status", "--job", disposable.id]) as { stage: string };
  if (!["cancelled", "failed"].includes(interrupted.stage)) throw new Error(`Disposable restart job recovered as ${interrupted.stage}.`);
  const retried = await cli(["retry", "--job", disposable.id]) as { id: string };
  let recovered: { stage?: string; error?: string } = {};
  const recoveryDeadline = Date.now() + 300_000;
  while (Date.now() < recoveryDeadline) {
    recovered = await cli(["status", "--job", retried.id]) as { stage?: string; error?: string };
    if (["complete", "failed", "cancelled"].includes(recovered.stage || "")) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (recovered.stage !== "complete") throw new Error(`Explicit recovery retry ended in ${recovered.stage}: ${recovered.error || "unknown"}.`);

  const finalProject = await cli(["get", "--project", project.id]) as ReelProject;
  const officialAsset = finalProject.assets.find((asset) => asset.id === importedIdentity.id);
  if (officialAsset?.role !== "official-brand-motion" || officialAsset.hash !== officialMotionHashBefore) {
    throw new Error("Official identity motion provenance was not preserved as imported managed media.");
  }
  for (const [sourceFile, beforeHash] of Object.entries(sourceHashesBefore)) {
    if (await fileHash(sourceFile) !== beforeHash) throw new Error(`Source media changed: ${sourceFile}`);
  }
  if (await fileHash(officialMotion) !== officialMotionHashBefore) throw new Error("Official identity motion source changed.");
  const composerSourceAfter = await sourceFingerprint();
  const founderProjectsAfter = await founderProjectsFingerprint();
  if (composerSourceAfter !== composerSourceBefore) throw new Error("Composer source changed during production operation.");
  if (founderProjectsAfter !== founderProjectsBefore) throw new Error("Founder Reel projects changed during qualification.");

  async function probeVideo(fileName: string, width: number, height: number, minimumDuration: number): Promise<Record<string, unknown>> {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", fileName], { maxBuffer: 4 * 1024 * 1024 });
    const probe = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>; format?: { duration?: string } };
    const video = probe.streams?.find((stream) => stream.codec_type === "video");
    const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
    const duration = Number(probe.format?.duration || 0);
    if (video?.codec_name !== "h264" || video.width !== width || video.height !== height || !audio || duration < minimumDuration) {
      throw new Error(`Video qualification failed for ${fileName}: ${JSON.stringify(probe)}`);
    }
    return { codec: video.codec_name, audioCodec: audio.codec_name, width: video.width, height: video.height, duration };
  }
  const reviewProbe = await probeVideo(review.output, 1080, 1920, 17.8);
  const deliveryProbe = await probeVideo(delivery.output, 1080, 1920, 17.8);
  const alternateProbe = await probeVideo(alternateOutput.output, 1920, 1080, 17.8);
  for (const bundle of [review.provenance, delivery.provenance, alternateOutput.provenance]) {
    const { stdout } = await execFileAsync("unzip", ["-Z1", bundle]);
    const entries = stdout.split("\n");
    if (!entries.some((entry) => entry.endsWith("-recipe.json")) || !entries.some((entry) => entry.endsWith("-manifest.json")) || !entries.includes("qa-report.json")) {
      throw new Error(`Incomplete provenance bundle: ${bundle}`);
    }
  }

  const openGuide = `# Open the W5 Qualification Project in the GUI\n\n\`\`\`bash\ncd ${composerRoot}\nHINTS_REEL_PROJECTS_DIR=${projectsRoot} npm run dev\n\`\`\`\n\nOpen http://127.0.0.1:8090. The project is isolated qualification evidence and is not a Founder production project.\n`;
  await fs.writeFile(path.join(root, "OPEN_IN_GUI.md"), openGuide, "utf8");
  qualificationResult = {
    schema: "hints-production-qualification/v1",
    generatedAt: new Date().toISOString(),
    status: "PASS",
    projectId: project.id,
    durationSeconds: 18,
    primaryAspectRatio: "9:16",
    alternateAspectRatio: "16:9",
    review: { jobId: review.job.id, file: review.output, probe: reviewProbe, provenance: review.provenance },
    delivery: { jobId: delivery.job.id, file: delivery.output, probe: deliveryProbe, provenance: delivery.provenance },
    alternate: { jobId: alternateOutput.job.id, file: alternateOutput.output, probe: alternateProbe, provenance: alternateOutput.provenance },
    recovery: {
      activeBlockerJobId: blocker.id,
      activeBlockerRecoveredStage: blockerAfterRestart.stage,
      originalJobId: disposable.id,
      recoveredInitialStage: interrupted.stage,
      retryJobId: retried.id,
      retryStage: recovered.stage
    },
    recipe: canonicalRecipe,
    officialIdentity: { source: officialMotion, sourceHash: officialMotionHashBefore, importedRole: officialAsset.role, reconstructed: false },
    sourceMediaUnchanged: true,
    composerSourceBefore,
    composerSourceAfter,
    founderProjectsBefore,
    founderProjectsAfter,
    guiRequiredForProduction: false,
    guiReviewAvailable: true,
    externalProviderRequired: false,
    manualEditingAfterWorkflowInvocation: false
  };
  await fs.writeFile(path.join(root, "production-qualification-report.json"), `${JSON.stringify(qualificationResult, null, 2)}\n`, "utf8");
  console.log(`Production qualification PASS: ${path.join(root, "production-qualification-report.json")}`);
} finally {
  await stopServer(server, "qualification-final").catch(() => undefined);
  await fs.writeFile(path.join(root, "agent-operation-log.json"), `${JSON.stringify(operations, null, 2)}\n`, "utf8");
  if (!suppliedRoot && process.env.HRC_PRODUCTION_QUALIFICATION_KEEP !== "1") await fs.rm(root, { recursive: true, force: true });
}

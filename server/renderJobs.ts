import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { RenderPreset } from "../shared/project.js";
import { projectFile } from "./paths.js";
import { readProject } from "./projectStore.js";
import { compileRender } from "./renderCompiler.js";

export type RenderStage = "queued" | "compiling" | "rendering" | "qa" | "complete" | "failed" | "cancelled";
export type RenderFailureKind = "ENCODE_FAILURE" | "QA_EXTRACTION_FAILURE" | "TECHNICAL_QA_FAILURE";

export class RenderPipelineError extends Error {
  constructor(readonly kind: RenderFailureKind, message: string) {
    super(message);
    this.name = "RenderPipelineError";
  }
}

export interface QaSample {
  frame: number;
  timestamp: number;
}

export function qaSamplePlan(duration: number, fps: number, frameCount?: number): QaSample[] {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 1;
  const derivedCount = Number.isFinite(frameCount) && (frameCount as number) > 0
    ? Math.max(1, Math.floor(frameCount as number))
    : Math.max(1, Math.round(Math.max(0, Number.isFinite(duration) ? duration : 0) * safeFps));
  return [0.15, 0.42, 0.83, 0.95].map((ratio) => {
    const frame = Math.min(derivedCount - 1, Math.max(0, Math.round((derivedCount - 1) * ratio)));
    return { frame, timestamp: frame / safeFps };
  });
}

export interface RenderJob {
  id: string;
  projectId: string;
  sequenceId: string;
  preset: RenderPreset;
  stage: RenderStage;
  progress: number;
  message: string;
  createdAt: string;
  outputUrl?: string;
  outputFileName?: string;
  error?: string;
  failureKind?: RenderFailureKind;
}

interface InternalJob extends RenderJob {
  process?: ReturnType<typeof spawn>;
  emitter: EventEmitter;
}

export class RenderJobManager {
  private jobs = new Map<string, InternalJob>();

  get(jobId: string): RenderJob | undefined {
    const job = this.jobs.get(jobId);
    return job ? this.publicJob(job) : undefined;
  }

  subscribe(jobId: string, listener: (job: RenderJob) => void): (() => void) | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    const wrapped = () => listener(this.publicJob(job));
    job.emitter.on("update", wrapped);
    listener(this.publicJob(job));
    return () => job.emitter.off("update", wrapped);
  }

  async create(projectId: string, sequenceId: string, preset: RenderPreset): Promise<RenderJob> {
    const id = randomUUID();
    const job: InternalJob = {
      id,
      projectId,
      sequenceId,
      preset,
      stage: "queued",
      progress: 0,
      message: "Queued",
      createdAt: new Date().toISOString(),
      emitter: new EventEmitter()
    };
    this.jobs.set(id, job);
    void this.run(job);
    return this.publicJob(job);
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || ["complete", "failed", "cancelled"].includes(job.stage)) return false;
    job.process?.kill("SIGTERM");
    this.update(job, { stage: "cancelled", message: "Render cancelled", progress: job.progress });
    return true;
  }

  private publicJob(job: InternalJob): RenderJob {
    const { emitter: _emitter, process: _process, ...publicState } = job;
    return publicState;
  }

  private update(job: InternalJob, patch: Partial<RenderJob>): void {
    Object.assign(job, patch);
    job.emitter.emit("update");
  }

  private async run(job: InternalJob): Promise<void> {
    try {
      this.update(job, { stage: "compiling", progress: 0.02, message: "Compiling render graph" });
      const project = await readProject(job.projectId);
      const sequence = project.sequences.find((candidate) => candidate.id === job.sequenceId);
      if (!sequence) throw new Error("Sequence not found.");
      const safeTitle = project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hints-reel";
      const stem = `${safeTitle}-${job.preset}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      const compilation = compileRender(project, sequence, job.preset, stem);
      job.outputFileName = compilation.outputFileName;
      await Promise.all([
        fs.writeFile(projectFile(job.projectId, "logs", `${job.id}-filtergraph.txt`), `${compilation.filterGraph}\n`, "utf8"),
        fs.writeFile(projectFile(job.projectId, "logs", `${job.id}-manifest.json`), `${JSON.stringify(compilation.manifest, null, 2)}\n`, "utf8"),
        fs.writeFile(projectFile(job.projectId, "logs", `${job.id}-recipe.json`), `${JSON.stringify(project, null, 2)}\n`, "utf8")
      ]);
      await fs.mkdir(path.dirname(compilation.outputPath), { recursive: true });
      this.update(job, { stage: "rendering", progress: 0.04, message: "Rendering with FFmpeg" });
      await this.spawnFfmpeg(job, compilation.args, sequence.duration);
      if (job.stage === "cancelled") return;
      if (compilation.frameDirectory) {
        this.update(job, { stage: "rendering", progress: 0.92, message: "Packaging PNG sequence" });
        await this.packagePngSequence(job, compilation.frameDirectory, compilation.artifactPath);
      }
      this.update(job, { stage: "qa", progress: 0.94, message: "Running technical QA" });
      await this.runQa(job, compilation.artifactPath, sequence.duration, sequence.fps, compilation.frameDirectory);
      this.update(job, {
        stage: "complete",
        progress: 1,
        message: "Render complete",
        outputUrl: `/api/v1/projects/${job.projectId}/artifacts/renders/${compilation.outputFileName}`
      });
    } catch (error) {
      if (job.stage === "cancelled") return;
      const message = error instanceof Error ? error.message : String(error);
      const failureKind = error instanceof RenderPipelineError ? error.kind : undefined;
      this.update(job, { stage: "failed", message: "Render failed", error: message, failureKind });
    }
  }

  private spawnFfmpeg(job: InternalJob, args: string[], duration: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      job.process = child;
      let stdoutBuffer = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || "";
        for (const line of lines) {
          const [key, rawValue] = line.split("=", 2);
          if (key === "out_time_us") {
            const seconds = Number(rawValue) / 1_000_000;
            const progress = Math.min(0.92, 0.04 + (seconds / Math.max(0.1, duration)) * 0.88);
            this.update(job, { progress, message: `Rendering ${seconds.toFixed(1)}s / ${duration.toFixed(1)}s` });
          }
        }
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        if (stderr.length > 2_000_000) stderr = stderr.slice(-2_000_000);
      });
      child.on("error", (error) => reject(new RenderPipelineError("ENCODE_FAILURE", error.message)));
      child.on("close", async (code) => {
        await fs.writeFile(projectFile(job.projectId, "logs", `${job.id}-ffmpeg.log`), stderr, "utf8").catch(() => undefined);
        job.process = undefined;
        if (job.stage === "cancelled") return resolve();
        if (code === 0) resolve();
        else reject(new RenderPipelineError("ENCODE_FAILURE", stderr.split("\n").filter(Boolean).slice(-8).join("\n") || `FFmpeg exited with code ${code}.`));
      });
    });
  }

  private packagePngSequence(job: InternalJob, frameDirectory: string, artifactPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("zip", ["-q", "-r", artifactPath, path.basename(frameDirectory)], {
        cwd: path.dirname(frameDirectory),
        stdio: ["ignore", "ignore", "pipe"]
      });
      job.process = child;
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      child.on("error", (error) => reject(new RenderPipelineError("ENCODE_FAILURE", error.message)));
      child.on("close", (code) => {
        job.process = undefined;
        if (job.stage === "cancelled") return resolve();
        if (code === 0) resolve();
        else reject(new RenderPipelineError("ENCODE_FAILURE", stderr || `zip exited with code ${code}.`));
      });
    });
  }

  private async runQa(job: InternalJob, outputPath: string, duration: number, fps: number, frameDirectory?: string): Promise<void> {
    const qaDir = projectFile(job.projectId, "qa", job.id);
    await fs.mkdir(qaDir, { recursive: true });
    const runCapture = (tool: string, args: string[], kind: RenderFailureKind, label: string): Promise<{ stdout: string; stderr: string }> => new Promise((resolve, reject) => {
      const child = spawn(tool, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      child.on("error", (error) => reject(new RenderPipelineError(kind, `${label}: ${error.message}`)));
      child.on("close", (code) => code === 0
        ? resolve({ stdout, stderr })
        : reject(new RenderPipelineError(kind, `${label}: ${stderr.trim() || `${tool} exited with code ${code}.`}`)));
    });
    const parseRate = (value?: string): number => {
      if (!value) return 0;
      const [numerator, denominator = "1"] = value.split("/");
      const result = Number(numerator) / Number(denominator);
      return Number.isFinite(result) && result > 0 ? result : 0;
    };
    type QaProbe = {
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
        r_frame_rate?: string;
        nb_frames?: string;
        nb_read_frames?: string;
        sample_rate?: string;
        channels?: number;
      }>;
      format?: { duration?: string; size?: string; bit_rate?: string };
    };
    const probeTarget = async (target: string, countFrames = false): Promise<{ raw: string; parsed: QaProbe }> => {
      const { stdout } = await runCapture("ffprobe", [
        "-v", "error",
        ...(countFrames ? ["-count_frames"] : []),
        "-show_streams", "-show_format", "-of", "json", target
      ], "TECHNICAL_QA_FAILURE", "FFprobe QA failed");
      try {
        return { raw: stdout, parsed: JSON.parse(stdout) as QaProbe };
      } catch {
        throw new RenderPipelineError("TECHNICAL_QA_FAILURE", "FFprobe QA returned malformed JSON.");
      }
    };

    const framePaths: string[] = [];
    const isAnimatedWebp = path.extname(outputPath).toLowerCase() === ".webp";
    let actualDuration = duration;
    let actualFps = fps;
    let actualFrameCount = 0;
    let sourceFrames: string[] = [];
    let outputProbe: { raw: string; parsed: QaProbe } | undefined;
    if (frameDirectory) {
      sourceFrames = (await fs.readdir(frameDirectory)).filter((file) => file.endsWith(".png")).sort();
      actualFrameCount = sourceFrames.length;
      actualFps = Number.isFinite(fps) && fps > 0 ? fps : 1;
      actualDuration = actualFrameCount / actualFps;
    } else if (isAnimatedWebp) {
      const { stdout } = await runCapture("magick", ["identify", "-format", "%T\n", outputPath], "TECHNICAL_QA_FAILURE", "Animated WebP timing inspection failed");
      const delays = stdout.split("\n").filter((value) => value.trim() !== "").map(Number).filter((value) => Number.isFinite(value) && value >= 0);
      actualFrameCount = delays.length;
      actualDuration = delays.reduce((sum, value) => sum + value, 0) / 100;
      if (!(actualDuration > 0)) actualDuration = duration;
      actualFps = actualFrameCount > 0 && actualDuration > 0 ? actualFrameCount / actualDuration : fps;
    } else {
      outputProbe = await probeTarget(outputPath, true);
      const video = outputProbe.parsed.streams?.find((stream) => stream.codec_type === "video");
      actualDuration = Number(outputProbe.parsed.format?.duration || duration);
      actualFps = parseRate(video?.avg_frame_rate) || parseRate(video?.r_frame_rate) || fps;
      const reportedFrames = Number(video?.nb_read_frames || video?.nb_frames || 0);
      actualFrameCount = Number.isFinite(reportedFrames) && reportedFrames > 0
        ? Math.floor(reportedFrames)
        : Math.max(1, Math.round(actualDuration * actualFps));
    }

    if (actualFrameCount < 1) throw new RenderPipelineError("TECHNICAL_QA_FAILURE", "Rendered output did not contain an extractable frame.");
    const samples = qaSamplePlan(actualDuration, actualFps, actualFrameCount);
    for (const [index, sample] of samples.entries()) {
      const framePath = path.join(qaDir, `frame-${index + 1}.${frameDirectory || isAnimatedWebp ? "png" : "jpg"}`);
      framePaths.push(framePath);
      if (frameDirectory) {
        try {
          await fs.copyFile(path.join(frameDirectory, sourceFrames[sample.frame]), framePath);
        } catch (error) {
          throw new RenderPipelineError("QA_EXTRACTION_FAILURE", `PNG sequence frame ${sample.frame} could not be copied: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else if (isAnimatedWebp) {
        const deletionArgs = sample.frame > 0 ? ["-delete", `0-${sample.frame - 1}`] : [];
        const trailingDeletionArgs = sample.frame < actualFrameCount - 1 ? ["-delete", "1--1"] : [];
        await runCapture("magick", [outputPath, "-coalesce", ...deletionArgs, ...trailingDeletionArgs, framePath], "QA_EXTRACTION_FAILURE", `Animated WebP frame ${sample.frame} extraction failed`);
      } else {
        await runCapture("ffmpeg", [
          "-hide_banner", "-loglevel", "error", "-y", "-i", outputPath,
          "-vf", `select=eq(n\\,${sample.frame})`, "-vsync", "0", "-frames:v", "1", "-q:v", "2", framePath
        ], "QA_EXTRACTION_FAILURE", `QA frame ${sample.frame} extraction failed`);
      }
    }

    const technicalProbe = outputProbe || await probeTarget(framePaths[0]);
    await fs.writeFile(path.join(qaDir, "ffprobe.json"), technicalProbe.raw, "utf8");

    await new Promise<void>((resolve) => {
      const child = spawn("magick", [
        ...framePaths,
        "-resize", "270x480",
        "+append",
        path.join(qaDir, "contact-sheet.jpg")
      ]);
      child.on("error", () => resolve());
      child.on("close", () => resolve());
    });

    const audioAnalysis = frameDirectory || isAnimatedWebp ? "Not applicable to silent image-sequence formats." : await new Promise<string>((resolve) => {
      const child = spawn("ffmpeg", [
        "-hide_banner", "-nostats", "-i", outputPath,
        "-filter:a", "ebur128=peak=true", "-f", "null", "-"
      ]);
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      child.on("error", () => resolve("Audio analysis unavailable."));
      child.on("close", () => resolve(stderr.split("\n").slice(-40).join("\n")));
    });

    const parsedProbe = technicalProbe.parsed;
    const video = parsedProbe.streams?.find((stream) => stream.codec_type === "video");
    const audio = parsedProbe.streams?.find((stream) => stream.codec_type === "audio");
    const qaReport = {
      schema: "hints-reel-qa/v1",
      renderJobId: job.id,
      inspectedAt: new Date().toISOString(),
      outputFile: path.basename(outputPath),
      frameSamples: samples.map((sample, index) => ({ ...sample, file: path.basename(framePaths[index]) })),
      contactSheet: "contact-sheet.jpg",
      technical: {
        width: video?.width,
        height: video?.height,
        averageFrameRate: video?.avg_frame_rate,
        duration: String(actualDuration),
        bytes: frameDirectory || isAnimatedWebp ? String((await fs.stat(outputPath)).size) : parsedProbe.format?.size,
        bitrate: parsedProbe.format?.bit_rate,
        audioSampleRate: audio?.sample_rate,
        audioChannels: audio?.channels,
        actualFrameCount
      },
      checks: {
        durationPresent: actualDuration > 0,
        dimensionsPresent: Boolean(video?.width && video?.height),
        frameRatePresent: actualFps > 0 && actualFrameCount > 0,
        sampleFramesPresent: framePaths.length === samples.length,
        audioPresent: frameDirectory || isAnimatedWebp ? "not-applicable" : Boolean(audio)
      },
      audioAnalysis
    };
    await fs.writeFile(path.join(qaDir, "qa-report.json"), `${JSON.stringify(qaReport, null, 2)}\n`, "utf8");
    if (!qaReport.checks.durationPresent || !qaReport.checks.dimensionsPresent || !qaReport.checks.frameRatePresent || !qaReport.checks.sampleFramesPresent) {
      throw new RenderPipelineError("TECHNICAL_QA_FAILURE", "Rendered output failed technical QA invariants.");
    }
  }
}

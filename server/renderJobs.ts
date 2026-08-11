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
      this.update(job, { stage: "failed", message: "Render failed", error: message });
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
      child.on("error", reject);
      child.on("close", async (code) => {
        await fs.writeFile(projectFile(job.projectId, "logs", `${job.id}-ffmpeg.log`), stderr, "utf8").catch(() => undefined);
        job.process = undefined;
        if (job.stage === "cancelled") return resolve();
        if (code === 0) resolve();
        else reject(new Error(stderr.split("\n").filter(Boolean).slice(-8).join("\n") || `FFmpeg exited with code ${code}.`));
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
      child.on("error", reject);
      child.on("close", (code) => {
        job.process = undefined;
        if (job.stage === "cancelled") return resolve();
        if (code === 0) resolve();
        else reject(new Error(stderr || `zip exited with code ${code}.`));
      });
    });
  }

  private async runQa(job: InternalJob, outputPath: string, duration: number, fps: number, frameDirectory?: string): Promise<void> {
    const qaDir = projectFile(job.projectId, "qa", job.id);
    await fs.mkdir(qaDir, { recursive: true });
    const timestamps = [0.15, 0.42, 0.83, 0.95].map((ratio) => Math.max(0, duration * ratio));
    const framePaths: string[] = [];
    const isAnimatedWebp = path.extname(outputPath).toLowerCase() === ".webp";
    let derivedFrameCount: number | undefined;
    if (frameDirectory) {
      const sourceFrames = (await fs.readdir(frameDirectory)).filter((file) => file.endsWith(".png")).sort();
      if (sourceFrames.length === 0) throw new Error("PNG sequence did not produce frames.");
      derivedFrameCount = sourceFrames.length;
      for (const [index, ratio] of [0.15, 0.42, 0.83, 0.95].entries()) {
        const sourceIndex = Math.min(sourceFrames.length - 1, Math.round((sourceFrames.length - 1) * ratio));
        const framePath = path.join(qaDir, `frame-${index + 1}.png`);
        framePaths.push(framePath);
        await fs.copyFile(path.join(frameDirectory, sourceFrames[sourceIndex]), framePath);
      }
    } else if (isAnimatedWebp) {
      derivedFrameCount = await new Promise<number>((resolve, reject) => {
        const child = spawn("magick", ["identify", "-format", "%n\n", outputPath]);
        let stdout = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => { stdout += chunk; });
        child.on("error", reject);
        child.on("close", (code) => code === 0 ? resolve(Number(stdout.trim().split("\n")[0])) : reject(new Error("Animated WebP frame count failed.")));
      });
      if (!derivedFrameCount) throw new Error("Animated WebP did not contain frames.");
      for (const [index, ratio] of [0.15, 0.42, 0.83, 0.95].entries()) {
        const sourceIndex = Math.min(derivedFrameCount - 1, Math.round((derivedFrameCount - 1) * ratio));
        const framePath = path.join(qaDir, `frame-${index + 1}.png`);
        framePaths.push(framePath);
        const deletionArgs = sourceIndex > 0 ? ["-delete", `0-${sourceIndex - 1}`] : [];
        await new Promise<void>((resolve, reject) => {
          const child = spawn("magick", [outputPath, "-coalesce", ...deletionArgs, "-delete", "1--1", framePath]);
          child.on("error", reject);
          child.on("close", (code) => code === 0 ? resolve() : reject(new Error("Animated WebP QA frame extraction failed.")));
        });
      }
    } else {
      for (const [index, timestamp] of timestamps.entries()) {
        const framePath = path.join(qaDir, `frame-${index + 1}.jpg`);
        framePaths.push(framePath);
        await new Promise<void>((resolve, reject) => {
          const child = spawn("ffmpeg", [
            "-hide_banner", "-loglevel", "error", "-y", "-ss", String(timestamp), "-i", outputPath,
            "-frames:v", "1", "-q:v", "2", framePath
          ]);
          child.on("error", reject);
          child.on("close", (code) => code === 0 ? resolve() : reject(new Error("QA frame extraction failed.")));
        });
      }
    }
    const probeTarget = frameDirectory || isAnimatedWebp ? framePaths[0] : outputPath;
    const probe = await new Promise<string>((resolve, reject) => {
      const child = spawn("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", probeTarget]);
      let stdout = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error("FFprobe QA failed.")));
    });
    await fs.writeFile(path.join(qaDir, "ffprobe.json"), probe, "utf8");

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

    const parsedProbe = JSON.parse(probe) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; sample_rate?: string; channels?: number }>;
      format?: { duration?: string; size?: string; bit_rate?: string };
    };
    const video = parsedProbe.streams?.find((stream) => stream.codec_type === "video");
    const audio = parsedProbe.streams?.find((stream) => stream.codec_type === "audio");
    const qaReport = {
      schema: "hints-reel-qa/v1",
      renderJobId: job.id,
      inspectedAt: new Date().toISOString(),
      outputFile: path.basename(outputPath),
      frameSamples: timestamps.map((timestamp, index) => ({ timestamp, file: path.basename(framePaths[index]) })),
      contactSheet: "contact-sheet.jpg",
      technical: {
        width: video?.width,
        height: video?.height,
        averageFrameRate: video?.avg_frame_rate,
        duration: frameDirectory || isAnimatedWebp ? String(duration) : parsedProbe.format?.duration,
        bytes: frameDirectory || isAnimatedWebp ? String((await fs.stat(outputPath)).size) : parsedProbe.format?.size,
        bitrate: parsedProbe.format?.bit_rate,
        audioSampleRate: audio?.sample_rate,
        audioChannels: audio?.channels,
        derivedFrameCount
      },
      checks: {
        durationPresent: frameDirectory || isAnimatedWebp ? duration > 0 : Number(parsedProbe.format?.duration || 0) > 0,
        dimensionsPresent: Boolean(video?.width && video?.height),
        frameRatePresent: frameDirectory || isAnimatedWebp ? derivedFrameCount === Math.round(duration * fps) : Boolean(video?.avg_frame_rate),
        audioPresent: frameDirectory || isAnimatedWebp ? "not-applicable" : Boolean(audio)
      },
      audioAnalysis
    };
    await fs.writeFile(path.join(qaDir, "qa-report.json"), `${JSON.stringify(qaReport, null, 2)}\n`, "utf8");
  }
}

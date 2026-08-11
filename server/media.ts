import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Response } from "express";
import type { MediaAsset, AssetKind } from "../shared/project.js";
import { projectFile } from "./paths.js";
import { readProject, writeProject } from "./projectStore.js";

const execFileAsync = promisify(execFile);

interface ProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  sample_rate?: string;
}

interface ProbeResult {
  format?: { duration?: string };
  streams?: ProbeStream[];
}

function safeFileName(value: string): string {
  const parsed = path.parse(value);
  const stem = parsed.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "media";
  const extension = parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${stem.slice(0, 90)}${extension}`;
}

function kindFromMime(mime: string, fileName: string): AssetKind {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  const extension = path.extname(fileName).toLowerCase();
  if ([".mp4", ".webm", ".mov", ".mkv", ".m4v"].includes(extension)) return "video";
  if ([".wav", ".mp3", ".aac", ".m4a", ".flac", ".ogg"].includes(extension)) return "audio";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)) return "image";
  throw new Error("Unsupported media type.");
}

function parseFrameRate(value?: string): number {
  if (!value) return 0;
  const [numerator, denominator = 1] = value.split("/").map(Number);
  return denominator ? numerator / denominator : 0;
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function probe(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate,sample_rate",
    "-of", "json",
    filePath
  ], { maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout) as ProbeResult;
}

async function createPreviewArtifacts(projectId: string, asset: MediaAsset, filePath: string): Promise<void> {
  if (asset.kind === "video" || asset.kind === "image") {
    const thumbnailName = `${asset.id}.jpg`;
    const args = asset.kind === "video"
      ? ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(Math.min(1, asset.duration * 0.2)), "-i", filePath, "-frames:v", "1", "-vf", "scale=360:-2:flags=lanczos", "-q:v", "3", projectFile(projectId, "thumbnails", thumbnailName)]
      : ["-hide_banner", "-loglevel", "error", "-y", "-i", filePath, "-frames:v", "1", "-vf", "scale=360:-2:flags=lanczos", "-q:v", "3", projectFile(projectId, "thumbnails", thumbnailName)];
    await execFileAsync("ffmpeg", args, { maxBuffer: 8 * 1024 * 1024 });
    asset.thumbnailUrl = `/api/v1/projects/${projectId}/artifacts/thumbnails/${thumbnailName}`;
  }
  if (asset.kind === "audio" || asset.hasAudio) {
    const waveformName = `${asset.id}.png`;
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", filePath,
      "-filter_complex", "aformat=channel_layouts=mono,showwavespic=s=720x120:colors=0x2ed9e9",
      "-frames:v", "1", projectFile(projectId, "waveforms", waveformName)
    ], { maxBuffer: 8 * 1024 * 1024 });
    asset.waveformUrl = `/api/v1/projects/${projectId}/artifacts/waveforms/${waveformName}`;
  }
}

export async function importUploadedMedia(projectId: string, temporaryPath: string, originalName: string, mime: string): Promise<MediaAsset> {
  const project = await readProject(projectId);
  const hash = await sha256(temporaryPath);
  const duplicate = project.assets.find((asset) => asset.hash === hash);
  if (duplicate) {
    await fs.unlink(temporaryPath).catch(() => undefined);
    return duplicate;
  }
  const kind = kindFromMime(mime, originalName);
  const id = randomUUID();
  const fileName = `${id}-${safeFileName(originalName)}`;
  const destination = projectFile(projectId, "media", fileName);
  await fs.rename(temporaryPath, destination).catch(async () => {
    await fs.copyFile(temporaryPath, destination);
    await fs.unlink(temporaryPath);
  });
  const metadata = await probe(destination);
  const video = metadata.streams?.find((stream) => stream.codec_type === "video");
  const audio = metadata.streams?.find((stream) => stream.codec_type === "audio");
  const asset: MediaAsset = {
    id,
    name: path.parse(originalName).name,
    kind,
    fileName,
    hash,
    duration: Number(metadata.format?.duration || (kind === "image" ? 4 : 0)),
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    fps: parseFrameRate(video?.r_frame_rate),
    hasAudio: Boolean(audio),
    audioSampleRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined,
    createdAt: new Date().toISOString(),
    mediaUrl: `/api/v1/projects/${projectId}/assets/${id}`
  };
  await createPreviewArtifacts(projectId, asset, destination);
  project.assets.push(asset);
  await writeProject(project);
  return asset;
}

export async function createProxy(projectId: string, assetId: string): Promise<{ proxyUrl: string }> {
  const project = await readProject(projectId);
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset || asset.kind !== "video") throw new Error("A video asset is required.");
  const proxyName = `${asset.id}-540p.mp4`;
  const proxyPath = projectFile(projectId, "proxies", proxyName);
  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", projectFile(projectId, "media", asset.fileName),
    "-vf", "scale=-2:960:flags=lanczos", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
    "-an", "-movflags", "+faststart", proxyPath
  ], { maxBuffer: 16 * 1024 * 1024 });
  return { proxyUrl: `/api/v1/projects/${projectId}/artifacts/proxies/${proxyName}` };
}

export async function streamAsset(projectId: string, assetId: string, requestRange: string | undefined, response: Response): Promise<void> {
  const project = await readProject(projectId);
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error("Asset not found.");
  const filePath = projectFile(projectId, "media", asset.fileName);
  const stats = await fs.stat(filePath);
  const mime = asset.kind === "video" ? "video/mp4" : asset.kind === "audio" ? "audio/wav" : "image/*";
  if (!requestRange) {
    response.writeHead(200, { "Content-Length": stats.size, "Content-Type": mime, "Accept-Ranges": "bytes" });
    createReadStream(filePath).pipe(response);
    return;
  }
  const match = /bytes=(\d+)-(\d*)/.exec(requestRange);
  if (!match) {
    response.status(416).end();
    return;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : stats.size - 1;
  response.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${stats.size}`,
    "Accept-Ranges": "bytes",
    "Content-Length": end - start + 1,
    "Content-Type": mime
  });
  createReadStream(filePath, { start, end }).pipe(response);
}

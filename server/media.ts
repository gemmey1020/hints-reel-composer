import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Response } from "express";
import type { MediaAsset, AssetKind, AssetRole } from "../shared/project.js";
import { projectFile, resolveExistingProjectFile, resolveProjectWriteFile } from "./paths.js";
import { ProjectRevisionConflict, readProject, writeProject } from "./projectStore.js";

const execFileAsync = promisify(execFile);

export class MediaInputError extends Error {
  readonly statusCode = 422;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  sample_rate?: string;
}

interface ProbeResult {
  format?: { duration?: string; format_name?: string };
  streams?: ProbeStream[];
}

interface ProxyMetadata {
  schema: "hints-preview-proxy/v1";
  assetId: string;
  sourceHash: string;
  fileName: string;
  createdAt: string;
}

function safeStem(value: string): string {
  const parsed = path.parse(value);
  return parsed.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "media";
}

function kindFromProbe(metadata: ProbeResult): AssetKind {
  const video = metadata.streams?.find((stream) => stream.codec_type === "video");
  const audio = metadata.streams?.find((stream) => stream.codec_type === "audio");
  const stillCodecs = new Set(["png", "mjpeg", "jpeg2000", "webp", "gif", "bmp", "tiff", "svg"]);
  if (video && stillCodecs.has(video.codec_name || "") && !audio) return "image";
  if (video) return "video";
  if (audio) return "audio";
  throw new MediaInputError("FFprobe did not find a supported audio, video, or image stream.");
}

function canonicalExtension(kind: AssetKind, metadata: ProbeResult, originalName: string): string {
  const codec = metadata.streams?.find((stream) => stream.codec_type === "video")?.codec_name;
  if (kind === "image") {
    if (codec === "mjpeg" || codec === "jpeg2000") return ".jpg";
    if (codec && ["png", "webp", "gif", "bmp", "tiff"].includes(codec)) return `.${codec}`;
    return ".png";
  }
  const original = path.extname(originalName).toLowerCase();
  const supported = kind === "video"
    ? new Set([".mp4", ".webm", ".mov", ".mkv", ".m4v"])
    : new Set([".wav", ".mp3", ".aac", ".m4a", ".flac", ".ogg"]);
  if (supported.has(original)) return original;
  return kind === "video" ? ".mp4" : ".wav";
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
    "-show_entries", "format=duration,format_name:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate",
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

export function parseAssetRole(value: unknown): AssetRole {
  if (value === undefined || value === "" || value === "source-media") return "source-media";
  if (value === "official-brand-motion") return value;
  throw new MediaInputError("Asset role must be source-media or official-brand-motion.");
}

export async function importUploadedMedia(
  projectId: string,
  temporaryPath: string,
  originalName: string,
  mime: string,
  roleInput: unknown = "source-media",
  expectedRevision?: number
): Promise<MediaAsset> {
  let destination: string | undefined;
  let assetId: string | undefined;
  try {
    const role = parseAssetRole(roleInput);
    const uploadStats = await fs.lstat(temporaryPath);
    if (uploadStats.isSymbolicLink()) throw new MediaInputError("Media upload cannot be a symbolic link.");
    if (!uploadStats.isFile()) throw new MediaInputError("Media upload must be a regular file.");
    const configuredLimit = Number(process.env.HRC_MAX_IMPORT_BYTES || 8 * 1024 * 1024 * 1024);
    const maximumBytes = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 8 * 1024 * 1024 * 1024;
    if (uploadStats.size > maximumBytes) throw new MediaInputError(`Media upload exceeds the configured size limit of ${maximumBytes} bytes.`);

    const project = await readProject(projectId);
    if (expectedRevision !== undefined && project.revision !== expectedRevision) throw new ProjectRevisionConflict();
    const hash = await sha256(temporaryPath);
    const duplicate = project.assets.find((asset) => asset.hash === hash);
    if (duplicate) {
      await fs.unlink(temporaryPath);
      return duplicate;
    }

    const metadata = await probe(temporaryPath).catch(() => {
      throw new MediaInputError("FFprobe could not decode the uploaded file as supported media.");
    });
    const kind = kindFromProbe(metadata);
    const video = metadata.streams?.find((stream) => stream.codec_type === "video");
    const audio = metadata.streams?.find((stream) => stream.codec_type === "audio");
    assetId = randomUUID();
    const fileName = `${assetId}-${safeStem(originalName)}${canonicalExtension(kind, metadata, originalName)}`;
    const managedDestination = await resolveProjectWriteFile(projectId, "media", fileName);
    destination = managedDestination;
    await fs.rename(temporaryPath, managedDestination).catch(async () => {
      await fs.copyFile(temporaryPath, managedDestination);
      await fs.unlink(temporaryPath);
    });
    const asset: MediaAsset = {
      id: assetId,
      name: path.parse(originalName).name.slice(0, 200) || "media",
      kind,
      role,
      fileName,
      hash,
      duration: Number(metadata.format?.duration || (kind === "image" ? 4 : 0)),
      width: Number(video?.width || 0),
      height: Number(video?.height || 0),
      fps: parseFrameRate(video?.r_frame_rate),
      hasAudio: Boolean(audio),
      audioSampleRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined,
      createdAt: new Date().toISOString(),
      mediaUrl: `/api/v1/projects/${projectId}/assets/${assetId}`,
      provenance: mime ? `upload-mime-hint:${mime}` : "upload-mime-hint:unknown"
    };
    await createPreviewArtifacts(projectId, asset, managedDestination);
    project.assets.push(asset);
    await writeProject(project);
    return asset;
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined);
    if (destination) await fs.unlink(destination).catch(() => undefined);
    if (assetId) {
      await Promise.all([
        fs.unlink(projectFile(projectId, "thumbnails", `${assetId}.jpg`)).catch(() => undefined),
        fs.unlink(projectFile(projectId, "waveforms", `${assetId}.png`)).catch(() => undefined)
      ]);
    }
    throw error;
  }
}

export async function createProxy(projectId: string, assetId: string, expectedRevision?: number): Promise<{ proxyUrl: string; proxySourceHash: string }> {
  const project = await readProject(projectId);
  if (expectedRevision !== undefined && project.revision !== expectedRevision) throw new ProjectRevisionConflict();
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset || asset.kind !== "video") throw new Error("A video asset is required.");
  const proxyName = `${asset.id}-540p.mp4`;
  const proxyPath = await resolveProjectWriteFile(projectId, "proxies", proxyName);
  const metadataPath = await resolveProjectWriteFile(projectId, "proxies", `${asset.id}-540p.json`);
  const sourcePath = await resolveExistingProjectFile(projectId, "media", asset.fileName);
  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", sourcePath,
    "-vf", "scale=-2:'min(540,ih)':flags=lanczos", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
    "-an", "-movflags", "+faststart", proxyPath
  ], { maxBuffer: 16 * 1024 * 1024 });
  const metadata: ProxyMetadata = {
    schema: "hints-preview-proxy/v1",
    assetId: asset.id,
    sourceHash: asset.hash,
    fileName: proxyName,
    createdAt: new Date().toISOString()
  };
  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  asset.proxyUrl = `/api/v1/projects/${projectId}/assets/${asset.id}/proxy`;
  asset.proxySourceHash = asset.hash;
  await writeProject(project);
  return { proxyUrl: asset.proxyUrl, proxySourceHash: asset.hash };
}

export async function resolvePreviewMedia(projectId: string, assetId: string): Promise<{ filePath: string; mime: string; usedProxy: boolean }> {
  const project = await readProject(projectId);
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error("Asset not found.");
  const sourcePath = await resolveExistingProjectFile(projectId, "media", asset.fileName);
  const mime = asset.kind === "video" ? "video/mp4" : asset.kind === "audio" ? "audio/wav" : "image/*";
  if (asset.kind !== "video" || !asset.proxyUrl || asset.proxySourceHash !== asset.hash) return { filePath: sourcePath, mime, usedProxy: false };
  try {
    const metadataPath = await resolveExistingProjectFile(projectId, "proxies", `${asset.id}-540p.json`);
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8")) as ProxyMetadata;
    if (metadata.schema !== "hints-preview-proxy/v1" || metadata.assetId !== asset.id || metadata.sourceHash !== asset.hash || metadata.fileName !== `${asset.id}-540p.mp4`) {
      return { filePath: sourcePath, mime, usedProxy: false };
    }
    const proxyPath = await resolveExistingProjectFile(projectId, "proxies", metadata.fileName);
    return { filePath: proxyPath, mime: "video/mp4", usedProxy: true };
  } catch {
    return { filePath: sourcePath, mime, usedProxy: false };
  }
}

async function streamFile(filePath: string, mime: string, requestRange: string | undefined, response: Response): Promise<void> {
  const stats = await fs.stat(filePath);
  if (!requestRange) {
    response.writeHead(200, { "Content-Length": stats.size, "Content-Type": mime, "Accept-Ranges": "bytes" });
    createReadStream(filePath).pipe(response);
    return;
  }
  const range = parseByteRange(requestRange, stats.size);
  if (!range) {
    response.setHeader("Content-Range", `bytes */${stats.size}`);
    response.status(416).end();
    return;
  }
  const { start, end } = range;
  response.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${stats.size}`,
    "Accept-Ranges": "bytes",
    "Content-Length": end - start + 1,
    "Content-Type": mime
  });
  createReadStream(filePath, { start, end }).pipe(response);
}

export async function streamPreviewMedia(projectId: string, assetId: string, requestRange: string | undefined, response: Response): Promise<void> {
  const resolved = await resolvePreviewMedia(projectId, assetId);
  await streamFile(resolved.filePath, resolved.mime, requestRange, response);
}

export async function streamAsset(projectId: string, assetId: string, requestRange: string | undefined, response: Response): Promise<void> {
  const project = await readProject(projectId);
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error("Asset not found.");
  const filePath = await resolveExistingProjectFile(projectId, "media", asset.fileName);
  const mime = asset.kind === "video" ? "video/mp4" : asset.kind === "audio" ? "audio/wav" : "image/*";
  await streamFile(filePath, mime, requestRange, response);
}

export function parseByteRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header || !Number.isSafeInteger(size) || size <= 0 || header.includes(",")) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) return null;
  return { start, end: Math.min(size - 1, requestedEnd) };
}

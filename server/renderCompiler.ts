import path from "node:path";
import { isTrackActive, type MediaAsset, type ReelClip, type ReelProject, type ReelSequence, type RenderPreset } from "../shared/project.js";
import { fontPath, projectFile } from "./paths.js";

export interface RenderCompilation {
  args: string[];
  filterGraph: string;
  outputPath: string;
  artifactPath: string;
  outputFileName: string;
  frameDirectory?: string;
  inputCount: number;
  manifest: Record<string, unknown>;
}

interface IndexedClip {
  clip: ReelClip;
  asset: MediaAsset;
  inputIndex: number;
  trackKind: "video" | "audio" | "graphics";
  trackOrder: number;
}

const PRESET_EXTENSION: Record<RenderPreset, string> = {
  draft: "mp4",
  review: "mp4",
  delivery: "mp4",
  archive: "mov",
  webm: "webm",
  gif: "gif",
  webp: "webp",
  png: "zip"
};

function ffColor(color: string): string {
  return color.replace("#", "0x");
}

function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

function number(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function expressionCall(name: string, ...args: string[]): string {
  return `${name}(${args.join("\\,")})`;
}

function easingExpression(progress: string, easing: string): string {
  if (easing === "ease-in") return `((${progress})*(${progress}))`;
  if (easing === "ease-out") return `(1-(1-(${progress}))*(1-(${progress})))`;
  if (easing === "ease-in-out") {
    return expressionCall(
      "if",
      expressionCall("lt", progress, "0.5"),
      `(2*(${progress})*(${progress}))`,
      `(1-((-2*(${progress})+2)*(-2*(${progress})+2))/2)`
    );
  }
  return progress;
}

export function keyframeExpression(
  clip: ReelClip,
  property: "x" | "y" | "scale" | "rotation" | "opacity",
  fallback: number,
  fps: number,
  timeVariable = "t"
): string {
  const keyframes = [...(clip.keyframes[property] || [])].sort((a, b) => a.frame - b.frame);
  if (keyframes.length === 0) return String(number(fallback));
  if (keyframes.length === 1) return String(number(keyframes[0].value, fallback));
  const globalTime = (frame: number) => number(clip.timelineStart) + frame / Math.max(1, fps);
  let expression = String(number(keyframes[keyframes.length - 1].value, fallback));
  for (let index = keyframes.length - 2; index >= 0; index -= 1) {
    const left = keyframes[index];
    const right = keyframes[index + 1];
    const start = globalTime(left.frame);
    const end = globalTime(right.frame);
    const duration = Math.max(1 / Math.max(1, fps), end - start);
    const rawProgress = `((${timeVariable}-${number(start)})/${number(duration)})`;
    const progress = expressionCall("max", "0", expressionCall("min", "1", rawProgress));
    const eased = easingExpression(progress, right.easing);
    const interpolated = `(${number(left.value)}+(${number(right.value)}-${number(left.value)})*(${eased}))`;
    expression = expressionCall("if", expressionCall("lt", timeVariable, String(number(end))), interpolated, expression);
  }
  const firstTime = globalTime(keyframes[0].frame);
  return expressionCall("if", expressionCall("lt", timeVariable, String(number(firstTime))), String(number(keyframes[0].value, fallback)), expression);
}

function alphaExpression(clip: ReelClip, fps: number, timeVariable = "t"): string {
  const start = number(clip.timelineStart);
  const end = start + number(clip.duration, 0.1);
  const opacity = keyframeExpression(clip, "opacity", Math.max(0, Math.min(1, number(clip.transform.opacity, 1))), fps, timeVariable);
  const fadeIn = Math.max(0, Math.min(number(clip.fadeIn), clip.duration / 2));
  const fadeOut = Math.max(0, Math.min(number(clip.fadeOut), clip.duration / 2));
  let expression = `(${opacity})`;
  if (fadeOut > 0) expression = `if(gt(${timeVariable}\,${end - fadeOut})\,${opacity}*(${end}-${timeVariable})/${fadeOut}\,${expression})`;
  if (fadeIn > 0) expression = `if(lt(${timeVariable}\,${start + fadeIn})\,${opacity}*(${timeVariable}-${start})/${fadeIn}\,${expression})`;
  return expression;
}

function clipInputArgs(asset: MediaAsset, clip: ReelClip, projectId: string): string[] {
  const sourcePath = projectFile(projectId, "media", asset.fileName);
  if (asset.kind === "image") return ["-loop", "1", "-t", String(clip.duration), "-i", sourcePath];
  return ["-i", sourcePath];
}

function videoFilter(indexed: IndexedClip, sequence: ReelSequence, label: string): string {
  const { clip } = indexed;
  const consumedDuration = clip.duration * Math.max(0.05, clip.playbackRate);
  const localTimeline = `(t+${number(clip.timelineStart)})`;
  const localAlphaTimeline = `(T+${number(clip.timelineStart)})`;
  const scale = keyframeExpression(clip, "scale", Math.max(0.05, clip.transform.scale), sequence.fps, localTimeline);
  const opacity = alphaExpression(clip, sequence.fps, localAlphaTimeline);
  const fit = clip.transform.fit === "contain"
    ? `scale=${sequence.width}:${sequence.height}:force_original_aspect_ratio=decrease,pad=${sequence.width}:${sequence.height}:(ow-iw)/2:(oh-ih)/2:color=black@0`
    : `scale=${sequence.width}:${sequence.height}:force_original_aspect_ratio=increase,crop=${sequence.width}:${sequence.height}`;
  const rotation = keyframeExpression(clip, "rotation", number(clip.transform.rotation), sequence.fps, localTimeline);
  const scaleIsAnimated = (clip.keyframes.scale || []).length > 0;
  const rotationIsAnimated = (clip.keyframes.rotation || []).length > 0;
  const filters = [
    `trim=start=${number(clip.sourceIn)}:duration=${consumedDuration}`,
    `setpts=(PTS-STARTPTS)/${Math.max(0.05, clip.playbackRate)}`,
    fit,
    `scale=w='iw*max(0.05\,(${scale}))':h='ih*max(0.05\,(${scale}))':flags=lanczos${scaleIsAnimated ? ":eval=frame" : ""}`,
    number(clip.transform.rotation) || rotationIsAnimated
      ? `rotate='(${rotation})*PI/180':ow=${rotationIsAnimated ? "hypot(iw\\,ih)" : "rotw(iw)"}:oh=${rotationIsAnimated ? "ow" : "roth(ih)"}:c=none`
      : "null",
    "format=rgba",
    `geq=r='r(X\,Y)':g='g(X\,Y)':b='b(X\,Y)':a='alpha(X\,Y)*max(0\,min(1\,(${opacity})))'`,
    `setpts=PTS+${number(clip.timelineStart)}/TB`
  ];
  return `[${indexed.inputIndex}:v]${filters.join(",")}[${label}]`;
}

function textFilter(input: string, output: string, clip: ReelClip, sequence: ReelSequence): string {
  const style = clip.textStyle;
  if (!style) return `[${input}]null[${output}]`;
  const start = number(clip.timelineStart);
  const end = start + number(clip.duration, 0.1);
  const x = `(w-text_w)/2+(${keyframeExpression(clip, "x", clip.transform.x, sequence.fps)})`;
  const y = `(h-text_h)/2+(${keyframeExpression(clip, "y", clip.transform.y, sequence.fps)})`;
  const baseSize = Math.max(8, style.fontSize * (sequence.height / 1920));
  const scaledSize = expressionCall("max", "8", `${number(baseSize)}*(${keyframeExpression(clip, "scale", clip.transform.scale, sequence.fps)})`);
  const options = [
    `fontfile='${fontPath(style.fontFamily, style.fontWeight)}'`,
    `text='${escapeDrawText(clip.text || "")}'`,
    `fontcolor=${ffColor(style.color)}`,
    `fontsize='${scaledSize}'`,
    `x='${x}'`,
    `y='${y}'`,
    `borderw=${Math.max(0, style.strokeWidth)}`,
    `bordercolor=${ffColor(style.strokeColor)}@0.92`,
    `shadowcolor=${ffColor(style.shadowColor)}@0.75`,
    `shadowx=0`,
    `shadowy=${Math.max(0, Math.round(style.shadowBlur / 3))}`,
    `alpha='${alphaExpression(clip, sequence.fps)}'`,
    `enable='between(t,${start},${end})'`
  ];
  return `[${input}]drawtext=${options.join(":")}[${output}]`;
}

function shapeFilter(input: string, output: string, clip: ReelClip, sequence: ReelSequence): string {
  const shape = clip.shape;
  if (!shape) return `[${input}]null[${output}]`;
  const start = number(clip.timelineStart);
  const end = start + number(clip.duration, 0.1);
  const width = Math.max(1, Math.round(shape.width * clip.transform.scale));
  const height = Math.max(1, Math.round(shape.height * clip.transform.scale));
  const x = `(w-${width})/2+(${keyframeExpression(clip, "x", clip.transform.x, sequence.fps)})`;
  const y = `(h-${height})/2+(${keyframeExpression(clip, "y", clip.transform.y, sequence.fps)})`;
  return `[${input}]drawbox=x=${x}:y=${y}:w=${width}:h=${height}:color=${ffColor(shape.color)}@${clip.transform.opacity}:t=fill:enable='between(t,${start},${end})'[${output}]`;
}

function outputArgs(preset: RenderPreset, sequence: ReelSequence): string[] {
  const duration = ["-t", String(sequence.duration)];
  if (preset === "gif") return [...duration, "-r", "24", "-an", "-c:v", "gif", "-loop", "0"];
  const common = [...duration, "-r", String(sequence.fps)];
  if (preset === "archive") return [...common, "-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le", "-c:a", "pcm_s24le"];
  if (preset === "webm") return [...common, "-c:v", "libvpx-vp9", "-crf", "18", "-b:v", "0", "-c:a", "libopus", "-b:a", "192k"];
  if (preset === "webp") return [...common, "-an", "-c:v", "libwebp_anim", "-lossless", "0", "-quality", "95", "-compression_level", "6", "-loop", "0"];
  if (preset === "png") return [...common, "-an", "-c:v", "png", "-pred", "mixed", "-compression_level", "4", "-start_number", "0"];
  const crf = preset === "draft" ? "24" : preset === "review" ? "17" : "14";
  const speed = preset === "draft" ? "veryfast" : "slow";
  return [
    ...common,
    "-c:v", "libx264", "-preset", speed, "-crf", crf, "-profile:v", "high",
    "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-movflags", "+faststart", "-c:a", "aac", "-ar", "48000", "-b:a", "256k"
  ];
}

export function compileRender(project: ReelProject, sequence: ReelSequence, preset: RenderPreset, outputStem: string): RenderCompilation {
  const inputArgs: string[] = [];
  const indexed: IndexedClip[] = [];
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const enabledTracks = sequence.tracks.filter((track) => isTrackActive(sequence, track, "visual") || isTrackActive(sequence, track, "audio"));
  for (const track of enabledTracks) {
    for (const clip of track.clips.filter((candidate) => candidate.enabled && candidate.kind === "media" && candidate.assetId)) {
      const asset = assets.get(clip.assetId!);
      if (!asset) continue;
      const inputIndex = indexed.length;
      inputArgs.push(...clipInputArgs(asset, clip, project.id));
      indexed.push({ clip, asset, inputIndex, trackKind: track.kind, trackOrder: track.order });
    }
  }

  const filters: string[] = [
    `color=c=${sequence.background}:s=${sequence.width}x${sequence.height}:r=${sequence.fps}:d=${sequence.duration},format=rgba[base0]`
  ];
  let currentVideo = "base0";
  let layerIndex = 0;
  const visualLayers = enabledTracks
    .filter((track) => isTrackActive(sequence, track, "visual"))
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .filter(({ clip }) => clip.enabled)
    .sort((a, b) => a.track.order - b.track.order || a.clip.timelineStart - b.clip.timelineStart);

  for (const layer of visualLayers) {
    const next = `v${++layerIndex}`;
    if (layer.clip.kind === "media") {
      const source = indexed.find((entry) => entry.clip.id === layer.clip.id);
      if (!source || source.asset.kind === "audio") continue;
      const clipLabel = `clipv${layerIndex}`;
      filters.push(videoFilter(source, sequence, clipLabel));
      const x = `(W-w)/2+(${keyframeExpression(layer.clip, "x", layer.clip.transform.x, sequence.fps)})`;
      const y = `(H-h)/2+(${keyframeExpression(layer.clip, "y", layer.clip.transform.y, sequence.fps)})`;
      filters.push(`[${currentVideo}][${clipLabel}]overlay=x='${x}':y='${y}':eval=frame:eof_action=pass:shortest=0:enable='between(t,${layer.clip.timelineStart},${layer.clip.timelineStart + layer.clip.duration})'[${next}]`);
    } else if (layer.clip.kind === "text") {
      filters.push(textFilter(currentVideo, next, layer.clip, sequence));
    } else if (layer.clip.kind === "shape") {
      filters.push(shapeFilter(currentVideo, next, layer.clip, sequence));
    } else {
      continue;
    }
    currentVideo = next;
  }
  if (preset === "gif") {
    filters.push(`[${currentVideo}]fps=24,scale=720:-2:flags=lanczos,split[gifSource][gifPaletteSource]`);
    filters.push("[gifPaletteSource]palettegen=stats_mode=full[gifPalette]");
    filters.push("[gifSource][gifPalette]paletteuse=dither=sierra2_4a[vout]");
  } else if (preset === "png") {
    filters.push(`[${currentVideo}]format=rgba[vout]`);
  } else {
    filters.push(`[${currentVideo}]format=yuv420p[vout]`);
  }

  const includeAudio = preset !== "gif" && preset !== "webp" && preset !== "png";
  const audioLabels: string[] = [];
  let audioIndex = 0;
  for (const entry of includeAudio ? indexed : []) {
    const track = enabledTracks.find((candidate) => candidate.clips.some((clip) => clip.id === entry.clip.id));
    if (!entry.asset.hasAudio || !track || !isTrackActive(sequence, track, "audio")) continue;
    const consumedDuration = entry.clip.duration * Math.max(0.05, entry.clip.playbackRate);
    const delay = Math.max(0, Math.round(entry.clip.timelineStart * 1000));
    const fadeIn = Math.max(0, Math.min(entry.clip.fadeIn, entry.clip.duration / 2));
    const fadeOut = Math.max(0, Math.min(entry.clip.fadeOut, entry.clip.duration / 2));
    const label = `a${audioIndex++}`;
    const audioFilters = [
      `atrim=start=${entry.clip.sourceIn}:duration=${consumedDuration}`,
      `asetpts=(PTS-STARTPTS)/${Math.max(0.05, entry.clip.playbackRate)}`,
      `volume=${Math.max(0, entry.clip.audioGain)}`
    ];
    if (fadeIn > 0) audioFilters.push(`afade=t=in:st=0:d=${fadeIn}`);
    if (fadeOut > 0) audioFilters.push(`afade=t=out:st=${Math.max(0, entry.clip.duration - fadeOut)}:d=${fadeOut}`);
    audioFilters.push(`adelay=${delay}|${delay}`, "aresample=48000");
    filters.push(`[${entry.inputIndex}:a]${audioFilters.join(",")}[${label}]`);
    audioLabels.push(`[${label}]`);
  }
  if (includeAudio && audioLabels.length > 0) {
    const normalization = project.renderSettings.normalizeAudio
      ? `,loudnorm=I=${project.renderSettings.loudnessTarget}:TP=${project.renderSettings.truePeak}:LRA=7`
      : "";
    filters.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=longest:normalize=0${normalization}[aout]`);
  } else if (includeAudio) {
    filters.push(`anullsrc=r=48000:cl=stereo:d=${sequence.duration}[aout]`);
  }

  const extension = PRESET_EXTENSION[preset];
  const outputFileName = preset === "png" ? `${outputStem}-png-sequence.${extension}` : `${outputStem}.${extension}`;
  const artifactPath = projectFile(project.id, "renders", outputFileName);
  const frameDirectory = preset === "png" ? projectFile(project.id, "renders", `${outputStem}-png-sequence`) : undefined;
  const outputPath = frameDirectory ? path.join(frameDirectory, "frame-%06d.png") : artifactPath;
  const mapArgs = includeAudio ? ["-map", "[vout]", "-map", "[aout]"] : ["-map", "[vout]"];
  const args = [
    "-hide_banner", "-y",
    ...inputArgs,
    "-filter_complex", filters.join(";"),
    ...mapArgs,
    ...outputArgs(preset, sequence),
    "-progress", "pipe:1", "-nostats",
    outputPath
  ];
  return {
    args,
    filterGraph: filters.join(";\n"),
    outputPath,
    artifactPath,
    outputFileName,
    frameDirectory,
    inputCount: indexed.length,
    manifest: {
      schema: "hints-render-manifest/v1",
      createdAt: new Date().toISOString(),
      projectId: project.id,
      sequenceId: sequence.id,
      preset,
      outputFileName,
      outputKind: preset === "png" ? "png-sequence-zip" : "single-file",
      resolution: `${sequence.width}x${sequence.height}`,
      fps: sequence.fps,
      duration: sequence.duration,
      clipCount: visualLayers.length,
      inputCount: indexed.length,
      tool: "ffmpeg"
    }
  };
}

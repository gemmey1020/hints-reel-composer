import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createMediaClip, createTextClip, type ReelClip } from "../shared/project.ts";
import { UPLOAD_ROOT, STUDIO_ROOT } from "../server/paths.ts";
import { importUploadedMedia } from "../server/media.ts";
import { createProject, readProject, writeProject } from "../server/projectStore.ts";

const execFileAsync = promisify(execFile);
const sourceRoot = path.join(STUDIO_ROOT, "content", "experiments", "obi-v4.1", "reel-01", "flow-quality-final-test-v03", "source");

async function stageAndImport(projectId: string, sourcePath: string, mime: string) {
  const temporary = path.join(UPLOAD_ROOT, `${randomUUID()}-${path.basename(sourcePath)}`);
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  await fs.copyFile(sourcePath, temporary);
  return importUploadedMedia(projectId, temporary, path.basename(sourcePath), mime);
}

function setText(clip: ReelClip, text: string, y: number, size: number, color = "#ffffff") {
  clip.text = text;
  clip.name = text.split("\n")[0].slice(0, 44);
  clip.transform.y = y;
  if (clip.textStyle) {
    clip.textStyle.fontFamily = "Bomstad Display";
    clip.textStyle.fontWeight = 700;
    clip.textStyle.fontSize = size;
    clip.textStyle.color = color;
    clip.textStyle.letterSpacing = 1.1;
    clip.textStyle.strokeWidth = 2;
  }
}

const project = await createProject("Flooded Clockwork v03");
const shot1 = await stageAndImport(project.id, path.join(sourceRoot, "flow_shot_01_abyssal_descent.mp4"), "video/mp4");
const shot2 = await stageAndImport(project.id, path.join(sourceRoot, "flow_shot_02_clockwork_lock.mp4.mp4"), "video/mp4");
const shot3 = await stageAndImport(project.id, path.join(sourceRoot, "flow_shot_03.mp4"), "video/mp4");
const voice = await stageAndImport(project.id, path.join(sourceRoot, "audio", "plato_quote_charon_en-gb.wav"), "audio/wav");

const soundDesignPath = path.join(UPLOAD_ROOT, `${randomUUID()}-sound-design.wav`);
await execFileAsync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "anoisesrc=color=pink:sample_rate=48000:duration=20",
  "-f", "lavfi", "-i", "sine=frequency=46:sample_rate=48000:duration=20",
  "-f", "lavfi", "-i", "sine=frequency=1175:sample_rate=48000:duration=0.14",
  "-filter_complex", "[0:a]highpass=f=32,lowpass=f=165,volume=0.045[pressure];[1:a]volume=0.026[rumble];[2:a]volume=0.045,adelay=16500|16500[signal];[pressure][rumble][signal]amix=inputs=3:duration=longest:normalize=0[aout]",
  "-map", "[aout]", "-c:a", "pcm_s24le", soundDesignPath
]);
const soundDesign = await importUploadedMedia(project.id, soundDesignPath, "Hints-pressure-rumble-signal.wav", "audio/wav");

const seeded = await readProject(project.id);
const sequence = seeded.sequences.find((candidate) => candidate.aspectRatio === "9:16")!;
seeded.activeSequenceId = sequence.id;
const videoTrack = sequence.tracks.find((track) => track.kind === "video")!;
const textTrack = sequence.tracks.find((track) => track.kind === "graphics" && track.order === 30)!;
const signalTrack = sequence.tracks.find((track) => track.kind === "graphics" && track.order === 20)!;
const narrationTrack = sequence.tracks.find((track) => track.kind === "audio" && track.name === "Narration")!;
const soundTrack = sequence.tracks.find((track) => track.kind === "audio" && track.name === "Sound Design")!;

const placements = [
  { asset: shot1, start: 0, duration: 8, name: "Shot 01 · Abyssal Descent" },
  { asset: shot2, start: 8, duration: 4, name: "Shot 02 · Clockwork Lock" },
  { asset: shot3, start: 12, duration: 6, name: "Shot 03 · Hero Gear" }
];
for (const placement of placements) {
  const clip = createMediaClip(placement.asset, videoTrack.id, placement.start);
  clip.name = placement.name;
  clip.duration = placement.duration;
  clip.audioGain = 0;
  clip.fadeIn = placement.start === 0 ? 0.65 : 0.2;
  clip.fadeOut = 0.3;
  videoTrack.clips.push(clip);
}

const notice = createTextClip(textTrack.id, 0, 18);
setText(notice, "INTERNAL EXPERIMENT // OBI V4.1 // NOT FOR PUBLICATION", -850, 20, "#a8b7bf");
notice.textStyle!.fontFamily = "Bomstad Display";
notice.textStyle!.fontWeight = 400;
notice.textStyle!.strokeWidth = 0;
notice.transform.opacity = 0.62;
textTrack.clips.push(notice);

const lineOne = createTextClip(textTrack.id, 16.48, 1.47);
setText(lineOne, "UNDER IMMENSE OPERATIONAL PRESSURE", -310, 34, "#74f4ff");
textTrack.clips.push(lineOne);
const lineTwo = createTextClip(textTrack.id, 16.48, 1.47);
setText(lineTwo, "UNSTABLE INFRASTRUCTURES COLLAPSE", -235, 34);
textTrack.clips.push(lineTwo);
const endCard = createTextClip(textTrack.id, 18, 2);
setText(endCard, "DISCOVER MORE", -12, 62);
endCard.fadeIn = 0.28;
endCard.fadeOut = 0.28;
textTrack.clips.push(endCard);

const signal: ReelClip = {
  id: randomUUID(), trackId: signalTrack.id, kind: "shape", name: "Tracking Signal",
  timelineStart: 16, duration: 1.3, sourceIn: 0, playbackRate: 1, enabled: true,
  transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.95, fit: "contain" },
  shape: { type: "line", color: "#74f4ff", width: 1080, height: 3 },
  audioGain: 1, fadeIn: 0.1, fadeOut: 0.1, keyframes: {}
};
signalTrack.clips.push(signal);

const voiceClip = createMediaClip(voice, narrationTrack.id, 0.75);
voiceClip.duration = Math.min(17.25, voice.duration);
voiceClip.audioGain = 0.78;
narrationTrack.clips.push(voiceClip);
const soundClip = createMediaClip(soundDesign, soundTrack.id, 0);
soundClip.duration = 20;
soundTrack.clips.push(soundClip);

sequence.duration = 20;
await writeProject(seeded);
console.log(`Golden Reel project created: ${project.id}`);
console.log(path.join("reel_projects", `${project.id}.hintsreel`, "project.json"));

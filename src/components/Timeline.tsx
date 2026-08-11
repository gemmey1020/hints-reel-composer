import { useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ReelClip, ReelTrack } from "../../shared/project.ts";
import { formatTimecode, snapTime } from "../lib/editor.ts";
import { useEditor } from "../state/EditorContext.tsx";
import { Icon } from "./Icon.tsx";

interface ClipDrag {
  clipId: string;
  mode: "move" | "trim-start" | "trim-end";
  pointerX: number;
  deltaSeconds: number;
  originalStart: number;
  originalDuration: number;
  originalSourceIn: number;
}

export function Timeline() {
  const {
    project, sequence, currentTime, selectedClipId, setSelectedClipId, setCurrentTime, updateClip, toggleTrackFlag,
    splitSelectedClip, duplicateSelectedClip, deleteSelectedClip, addTextToTimeline, addSignalToTimeline,
    undo, redo, canUndo, canRedo
  } = useEditor();
  const [pixelsPerSecond, setPixelsPerSecond] = useState(64);
  const [drag, setDrag] = useState<ClipDrag | null>(null);
  if (!project || !sequence) return null;
  const contentWidth = Math.max(900, sequence.duration * pixelsPerSecond);
  const rulerTicks = Array.from({ length: Math.ceil(sequence.duration) + 1 }, (_, index) => index);

  const beginDrag = (event: ReactPointerEvent, clip: ReelClip, mode: ClipDrag["mode"]) => {
    event.stopPropagation();
    if (sequence.tracks.find((track) => track.id === clip.trackId)?.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedClipId(clip.id);
    setDrag({ clipId: clip.id, mode, pointerX: event.clientX, deltaSeconds: 0, originalStart: clip.timelineStart, originalDuration: clip.duration, originalSourceIn: clip.sourceIn });
  };
  const moveDrag = (event: ReactPointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, deltaSeconds: (event.clientX - drag.pointerX) / pixelsPerSecond });
  };
  const endDrag = (event: ReactPointerEvent) => {
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const frame = 1 / sequence.fps;
    updateClip(drag.clipId, (clip) => {
      if (drag.mode === "move") {
        clip.timelineStart = Math.max(0, Math.min(sequence.duration - clip.duration, snapTime(drag.originalStart + drag.deltaSeconds, sequence, clip.id)));
      } else if (drag.mode === "trim-start") {
        const maxDelta = drag.originalDuration - frame;
        const delta = Math.max(-drag.originalStart, Math.min(maxDelta, drag.deltaSeconds));
        const nextStart = snapTime(drag.originalStart + delta, sequence, clip.id);
        const actualDelta = nextStart - drag.originalStart;
        clip.timelineStart = Math.max(0, nextStart);
        clip.duration = Math.max(frame, drag.originalDuration - actualDelta);
        clip.sourceIn = Math.max(0, drag.originalSourceIn + actualDelta * clip.playbackRate);
      } else {
        clip.duration = Math.max(frame, Math.min(sequence.duration - drag.originalStart, snapTime(drag.originalStart + drag.originalDuration + drag.deltaSeconds, sequence, clip.id) - drag.originalStart));
      }
    }, drag.mode === "move" ? "Move timeline clip" : "Trim timeline clip");
    setDrag(null);
  };

  const clipVisual = (clip: ReelClip) => {
    if (!drag || drag.clipId !== clip.id) return { start: clip.timelineStart, duration: clip.duration };
    const frame = 1 / sequence.fps;
    if (drag.mode === "move") return { start: Math.max(0, Math.min(sequence.duration - clip.duration, drag.originalStart + drag.deltaSeconds)), duration: drag.originalDuration };
    if (drag.mode === "trim-start") {
      const delta = Math.max(-drag.originalStart, Math.min(drag.originalDuration - frame, drag.deltaSeconds));
      return { start: drag.originalStart + delta, duration: drag.originalDuration - delta };
    }
    return { start: drag.originalStart, duration: Math.max(frame, drag.originalDuration + drag.deltaSeconds) };
  };

  return (
    <section className="timeline-panel" data-help-id="timeline.panel">
      <div className="timeline-toolbar">
        <strong>Timeline</strong>
        <span className="toolbar-rule" />
        <button data-help-id="timeline.undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Icon name="undo" /></button>
        <button data-help-id="timeline.redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><Icon name="redo" /></button>
        <button data-help-id="timeline.split" title="Split selected clip at playhead (S)" onClick={splitSelectedClip}><Icon name="blade" /></button>
        <button data-help-id="timeline.duplicate" title="Duplicate selected clip (Ctrl+D)" onClick={duplicateSelectedClip}><Icon name="copy" /></button>
        <button data-help-id="timeline.delete" title="Delete selected clip" onClick={deleteSelectedClip}><Icon name="delete" /></button>
        <span className="toolbar-rule" />
        <button data-help-id="timeline.addText" title="Add text" onClick={addTextToTimeline}><Icon name="text" /></button>
        <button data-help-id="timeline.addSignal" title="Add Hints signal" onClick={addSignalToTimeline}><Icon name="keyframe" /></button>
        <div className="timeline-zoom" data-help-id="timeline.zoom">
          <Icon name="zoomOut" />
          <input aria-label="Timeline zoom" type="range" min="36" max="150" value={pixelsPerSecond} onChange={(event) => setPixelsPerSecond(Number(event.target.value))} />
          <Icon name="zoomIn" />
        </div>
        <span className="timeline-readout" data-help-id="timeline.readout">{formatTimecode(currentTime, sequence.fps)}</span>
      </div>
      <div className="timeline-body" data-help-shift="off">
        <div className="track-headers">
          <div className="ruler-spacer" />
          {sequence.tracks.map((track) => <TrackHeader key={track.id} track={track} label={`${track.kind === "audio" ? "A" : "V"}${track.kind === "audio" ? sequence.tracks.filter((candidate) => candidate.kind === "audio").indexOf(track) + 1 : sequence.tracks.filter((candidate) => candidate.kind !== "audio").length - sequence.tracks.filter((candidate) => candidate.kind !== "audio").indexOf(track)}`} onToggle={(flag) => toggleTrackFlag(track.id, flag)} />)}
        </div>
        <div className="timeline-scroll">
          <div className="timeline-content" data-help-id="timeline.canvas" style={{ width: contentWidth }} onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setCurrentTime((event.clientX - rect.left) / pixelsPerSecond);
            setSelectedClipId(null);
          }}>
            <div className="timeline-ruler" data-help-id="timeline.ruler">
              {rulerTicks.map((second) => <button key={second} style={{ left: second * pixelsPerSecond }} onClick={() => setCurrentTime(second)}><i />{second % 2 === 0 && <span>{formatTimecode(second, sequence.fps).slice(0, 5)}</span>}</button>)}
            </div>
            {sequence.tracks.map((track) => (
              <div className={`timeline-track timeline-track--${track.kind} ${track.hidden ? "is-hidden" : ""}`} key={track.id}>
                {track.clips.map((clip) => {
                  const visual = clipVisual(clip);
                  return <div
                    key={clip.id}
                    className={`timeline-clip timeline-clip--${clip.kind} ${clip.id === selectedClipId ? "is-selected" : ""}`}
                    data-help-id="timeline.clip"
                    data-help-label={clip.name}
                    style={{ left: visual.start * pixelsPerSecond, width: Math.max(12, visual.duration * pixelsPerSecond) }}
                    onPointerDown={(event) => beginDrag(event, clip, "move")}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onDoubleClick={() => setCurrentTime(clip.timelineStart)}
                  >
                    <button className="trim-handle trim-handle--start" data-help-id="timeline.trimStart" aria-label="Trim clip start" onPointerDown={(event) => beginDrag(event, clip, "trim-start")} />
                    <span className="clip-icon"><Icon name={clip.kind === "text" ? "text" : clip.kind === "shape" ? "keyframe" : track.kind === "audio" ? "audio" : "video"} /></span>
                    <span className="clip-label"><strong>{clip.name}</strong><small>{formatTimecode(visual.start, sequence.fps)} – {formatTimecode(visual.start + visual.duration, sequence.fps)}</small></span>
                    <button className="trim-handle trim-handle--end" data-help-id="timeline.trimEnd" aria-label="Trim clip end" onPointerDown={(event) => beginDrag(event, clip, "trim-end")} />
                  </div>;
                })}
              </div>
            ))}
            <div className="playhead" data-help-id="timeline.playhead" style={{ left: currentTime * pixelsPerSecond }}><span>{formatTimecode(currentTime, sequence.fps)}</span><i /></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrackHeader({ track, label, onToggle }: { track: ReelTrack; label: string; onToggle: (flag: "locked" | "hidden" | "muted" | "solo") => void }) {
  return <div className={`track-header track-header--${track.kind}`}>
    <strong>{label}</strong>
    <button data-help-id="timeline.trackLock" title={track.locked ? "Unlock track" : "Lock track"} onClick={() => onToggle("locked")}><Icon name={track.locked ? "lock" : "unlock"} /></button>
    <button data-help-id="timeline.trackVisibility" title={track.hidden ? "Show track" : "Hide track"} onClick={() => onToggle("hidden")}><Icon name={track.hidden ? "eyeOff" : "eye"} /></button>
    <span>{track.name}</span>
    <button data-help-id="timeline.trackMute" className={track.muted ? "is-active" : ""} onClick={() => onToggle("muted")}>M</button>
    <button data-help-id="timeline.trackSolo" className={track.solo ? "is-active" : ""} onClick={() => onToggle("solo")}>S</button>
  </div>;
}

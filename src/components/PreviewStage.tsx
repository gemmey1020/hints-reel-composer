import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { isTrackActive, type MediaAsset, type ReelClip } from "../../shared/project.ts";
import { clipOpacityAtTime, formatTimecode, keyframedValue } from "../lib/editor.ts";
import { useEditor } from "../state/EditorContext.tsx";
import { Icon } from "./Icon.tsx";

function PreviewMedia({ asset, clip, time, playing }: { asset: MediaAsset; clip: ReelClip; time: number; playing: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceTime = clip.sourceIn + Math.max(0, time - clip.timelineStart) * clip.playbackRate;
  useEffect(() => {
    const video = videoRef.current;
    if (!video || asset.kind !== "video") return;
    const sync = () => {
      if (Math.abs(video.currentTime - sourceTime) > (playing ? 0.24 : 0.025)) video.currentTime = sourceTime;
    };
    sync();
    video.playbackRate = clip.playbackRate;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [asset.kind, clip.playbackRate, playing, sourceTime]);
  if (asset.kind === "image") return <img src={asset.mediaUrl} alt="" draggable={false} />;
  return <video ref={videoRef} src={asset.mediaUrl} muted playsInline preload="auto" />;
}

export function PreviewStage() {
  const { project, sequence, currentTime, playing, selectedClipId, setSelectedClipId, updateClip, togglePlayback, stepFrame } = useEditor();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const [drag, setDrag] = useState<{ clipId: string; startX: number; startY: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  if (!project || !sequence) return null;
  const scaleFactor = Math.min(stageSize.width / sequence.width, stageSize.height / sequence.height);
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const activeLayers = sequence.tracks
    .filter((track) => isTrackActive(sequence, track, "visual"))
    .flatMap((track) => track.clips.map((clip) => ({ clip, order: track.order })))
    .filter(({ clip }) => clip.enabled && currentTime >= clip.timelineStart && currentTime < clip.timelineStart + clip.duration)
    .sort((a, b) => a.order - b.order);

  const startDrag = (event: ReactPointerEvent, clip: ReelClip) => {
    event.stopPropagation();
    setSelectedClipId(clip.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ clipId: clip.id, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 });
  };
  const moveDrag = (event: ReactPointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, dx: event.clientX - drag.startX, dy: event.clientY - drag.startY });
  };
  const endDrag = (event: ReactPointerEvent) => {
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const x = drag.dx / Math.max(0.0001, scaleFactor);
    const y = drag.dy / Math.max(0.0001, scaleFactor);
    updateClip(drag.clipId, (clip) => {
      clip.transform.x += x;
      clip.transform.y += y;
    }, "Move layer in preview");
    setDrag(null);
  };

  return (
    <section className="preview-panel" data-help-id="preview.panel">
      <div className="preview-heading"><strong>Preview</strong><span>{sequence.width}×{sequence.height} · {sequence.aspectRatio}</span></div>
      <div className="preview-workspace" onClick={() => setSelectedClipId(null)}>
        <div
          ref={stageRef}
          className="preview-stage"
          data-help-id="preview.stage"
          style={{ aspectRatio: `${sequence.width} / ${sequence.height}`, background: sequence.background }}
        >
          <div className="safe-area safe-area--action" data-help-id="preview.actionSafe" />
          <div className="safe-area safe-area--title" data-help-id="preview.titleSafe" />
          <div className="center-guide center-guide--horizontal" data-help-id="preview.centerGuides" />
          <div className="center-guide center-guide--vertical" data-help-id="preview.centerGuides" />
          {activeLayers.map(({ clip }) => {
            const localTime = currentTime - clip.timelineStart;
            const x = keyframedValue(clip, "x", localTime, clip.transform.x, sequence.fps);
            const y = keyframedValue(clip, "y", localTime, clip.transform.y, sequence.fps);
            const opacity = clipOpacityAtTime(clip, localTime, sequence.fps);
            const scale = keyframedValue(clip, "scale", localTime, clip.transform.scale, sequence.fps);
            const rotation = keyframedValue(clip, "rotation", localTime, clip.transform.rotation, sequence.fps);
            const selected = clip.id === selectedClipId;
            const dragOffset = drag?.clipId === clip.id ? drag : null;
            const baseStyle: CSSProperties = {
              left: `calc(50% + ${x * scaleFactor + (dragOffset?.dx || 0)}px)`,
              top: `calc(50% + ${y * scaleFactor + (dragOffset?.dy || 0)}px)`,
              opacity,
              transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`
            };
            if (clip.kind === "media") {
              const asset = clip.assetId ? assets.get(clip.assetId) : undefined;
              if (!asset || asset.kind === "audio") return null;
              return (
                <div
                  key={clip.id}
                  className={`preview-layer preview-layer--media ${selected ? "is-selected" : ""}`}
                  data-help-id="preview.layer"
                  data-help-label={clip.name}
                  style={{ ...baseStyle, width: "100%", height: "100%" }}
                  onPointerDown={(event) => startDrag(event, clip)} onPointerMove={moveDrag} onPointerUp={endDrag}
                >
                  <div className="media-fit" style={{ objectFit: clip.transform.fit }}>
                    <PreviewMedia asset={asset} clip={clip} time={currentTime} playing={playing} />
                  </div>
                  {selected && <SelectionFrame label={clip.name} />}
                </div>
              );
            }
            if (clip.kind === "text" && clip.textStyle) {
              return (
                <div
                  key={clip.id}
                  className={`preview-layer preview-layer--text ${selected ? "is-selected" : ""}`}
                  data-help-id="preview.layer"
                  data-help-label={clip.name}
                  style={{
                    ...baseStyle,
                    width: "88%",
                    color: clip.textStyle.color,
                    fontFamily: clip.textStyle.fontFamily,
                    fontWeight: clip.textStyle.fontWeight,
                    fontSize: `${clip.textStyle.fontSize * scaleFactor}px`,
                    lineHeight: clip.textStyle.lineHeight,
                    letterSpacing: `${clip.textStyle.letterSpacing * scaleFactor}px`,
                    textAlign: clip.textStyle.align,
                    direction: clip.textStyle.direction,
                    WebkitTextStroke: `${clip.textStyle.strokeWidth * scaleFactor}px ${clip.textStyle.strokeColor}`,
                    textShadow: `0 ${Math.max(1, clip.textStyle.shadowBlur / 3) * scaleFactor}px ${clip.textStyle.shadowBlur * scaleFactor}px ${clip.textStyle.shadowColor}`
                  }}
                  onPointerDown={(event) => startDrag(event, clip)} onPointerMove={moveDrag} onPointerUp={endDrag}
                >
                  {clip.text?.split("\n").map((line, index) => <div key={`${line}-${index}`}>{line || "\u00a0"}</div>)}
                  {selected && <SelectionFrame label={clip.name} />}
                </div>
              );
            }
            if (clip.kind === "shape" && clip.shape) {
              return (
                <div
                  key={clip.id}
                  className={`preview-layer preview-layer--shape ${selected ? "is-selected" : ""}`}
                  data-help-id="preview.layer"
                  data-help-label={clip.name}
                  style={{
                    ...baseStyle,
                    width: clip.shape.width * scaleFactor,
                    height: Math.max(1, clip.shape.height * scaleFactor),
                    background: clip.shape.color,
                    boxShadow: `0 0 ${10 * scaleFactor}px ${clip.shape.color}55`
                  }}
                  onPointerDown={(event) => startDrag(event, clip)} onPointerMove={moveDrag} onPointerUp={endDrag}
                >{selected && <SelectionFrame label={clip.name} />}</div>
              );
            }
            return null;
          })}
          {activeLayers.length === 0 && (
            <div className="preview-empty"><span className="empty-signal" /><strong>THE SIGNAL FIELD</strong><span>Place media on the timeline to begin.</span></div>
          )}
        </div>
      </div>
      <div className="transport">
        <span className="transport-fit" data-help-id="preview.autoFit"><Icon name="fit" /> Auto Fit</span>
        <div className="transport-controls">
          <button data-help-id="preview.previousFrame" onClick={() => stepFrame(-1)} title="Previous frame"><Icon name="skipBack" /></button>
          <button className="transport-play" data-help-id="preview.play" onClick={togglePlayback} title={playing ? "Pause" : "Play"}><Icon name={playing ? "pause" : "play"} /></button>
          <button data-help-id="preview.nextFrame" onClick={() => stepFrame(1)} title="Next frame"><Icon name="skipForward" /></button>
        </div>
        <div className="preview-timecode" data-help-id="preview.timecode"><strong>{formatTimecode(currentTime, sequence.fps)}</strong><span>/ {formatTimecode(sequence.duration, sequence.fps)}</span></div>
      </div>
    </section>
  );
}

function SelectionFrame({ label }: { label: string }) {
  return <div className="selection-frame"><span>{label}</span><i className="handle handle--nw" /><i className="handle handle--ne" /><i className="handle handle--sw" /><i className="handle handle--se" /></div>;
}

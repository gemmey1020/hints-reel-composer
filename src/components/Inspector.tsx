import { useEffect, useState } from "react";
import type { ReelClip, TextStyle } from "../../shared/project.ts";
import { useEditor } from "../state/EditorContext.tsx";
import { Icon } from "./Icon.tsx";

function NumberControl({ label, helpId, value, step = 1, min, max, onChange, onKeyframe }: { label: string; helpId: string; value: number; step?: number; min?: number; max?: number; onChange: (value: number) => void; onKeyframe?: () => void }) {
  return <label className="inspector-control" data-help-id={helpId}><span>{label}{onKeyframe && <button type="button" className="keyframe-button" data-help-id="inspector.keyframe" onClick={onKeyframe} title={`Add ${label} keyframe`}><Icon name="keyframe" /></button>}</span><input type="number" value={Number(value.toFixed(3))} step={step} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function ColorControl({ label, helpId, value, onChange }: { label: string; helpId: string; value: string; onChange: (value: string) => void }) {
  return <label className="inspector-control" data-help-id={helpId}><span>{label}</span><span className="color-control"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><input value={value} onChange={(event) => onChange(event.target.value)} /></span></label>;
}

export function Inspector() {
  const { project, sequence, selectedClip, currentTime, updateClip, updateSequence, commit } = useEditor();
  const [tab, setTab] = useState<"layer" | "project">("layer");
  useEffect(() => { if (selectedClip) setTab("layer"); }, [selectedClip?.id]);
  if (!project || !sequence) return null;
  const patchClip = (updater: (clip: ReelClip) => void, label?: string) => selectedClip && updateClip(selectedClip.id, updater, label);
  const patchStyle = (key: keyof TextStyle, value: TextStyle[keyof TextStyle]) => patchClip((clip) => {
    if (clip.textStyle) (clip.textStyle as unknown as Record<string, unknown>)[key] = value;
  }, `Update text ${key}`);
  const keyframe = (property: "x" | "y" | "scale" | "rotation" | "opacity", value: number) => patchClip((clip) => {
    const frame = Math.round((currentTime - clip.timelineStart) * sequence.fps);
    const list = clip.keyframes[property] || [];
    const existing = list.find((item) => item.frame === frame);
    if (existing) existing.value = value;
    else list.push({ id: crypto.randomUUID(), frame: Math.max(0, frame), value, easing: "ease-in-out" });
    clip.keyframes[property] = list.sort((a, b) => a.frame - b.frame);
  }, `Add ${property} keyframe`);

  return (
    <aside className="panel inspector-panel" data-help-id="inspector.panel">
      <div className="panel-heading inspector-heading">
        <strong>Inspector</strong>
        <div className="segmented-control" data-help-id="inspector.tabs">
          <button className={tab === "layer" ? "is-active" : ""} onClick={() => setTab("layer")}>Layer</button>
          <button className={tab === "project" ? "is-active" : ""} onClick={() => setTab("project")}>Project</button>
        </div>
      </div>
      {tab === "layer" ? (
        selectedClip ? <div className="inspector-scroll">
          <div className="selected-layer-title" data-help-id="inspector.rename">
            <Icon name={selectedClip.kind === "text" ? "text" : selectedClip.kind === "media" ? "video" : "keyframe"} />
            <input value={selectedClip.name} onChange={(event) => patchClip((clip) => { clip.name = event.target.value; }, "Rename clip")} />
          </div>
          {selectedClip.kind === "text" && <section className="inspector-section inspector-section--open">
            <h3>Text</h3>
            <textarea data-help-id="inspector.textContent" value={selectedClip.text || ""} dir={selectedClip.textStyle?.direction || "ltr"} onChange={(event) => patchClip((clip) => { clip.text = event.target.value; }, "Edit text")} />
            {selectedClip.textStyle && <>
              <label className="inspector-control" data-help-id="inspector.font"><span>Font</span><select value={selectedClip.textStyle.fontFamily} onChange={(event) => patchStyle("fontFamily", event.target.value)}><option>Bomstad Display</option><option>Hakira</option><option>Tajawal</option></select></label>
              <label className="inspector-control" data-help-id="inspector.weight"><span>Weight</span><select value={selectedClip.textStyle.fontWeight} onChange={(event) => patchStyle("fontWeight", Number(event.target.value))}>{[400, 500, 600, 700, 800].map((weight) => <option key={weight}>{weight}</option>)}</select></label>
              <NumberControl label="Font size" helpId="inspector.fontSize" value={selectedClip.textStyle.fontSize} min={8} max={400} onChange={(value) => patchStyle("fontSize", value)} />
              <NumberControl label="Tracking" helpId="inspector.tracking" value={selectedClip.textStyle.letterSpacing} step={0.1} onChange={(value) => patchStyle("letterSpacing", value)} />
              <ColorControl label="Color" helpId="inspector.textColor" value={selectedClip.textStyle.color} onChange={(value) => patchStyle("color", value)} />
            </>}
          </section>}
          <section className="inspector-section inspector-section--open">
            <h3>Transform</h3>
            <div className="control-grid">
              <NumberControl label="Position X" helpId="inspector.positionX" value={selectedClip.transform.x} onChange={(value) => patchClip((clip) => { clip.transform.x = value; })} onKeyframe={() => keyframe("x", selectedClip.transform.x)} />
              <NumberControl label="Position Y" helpId="inspector.positionY" value={selectedClip.transform.y} onChange={(value) => patchClip((clip) => { clip.transform.y = value; })} onKeyframe={() => keyframe("y", selectedClip.transform.y)} />
              <NumberControl label="Scale" helpId="inspector.scale" value={selectedClip.transform.scale} step={0.01} min={0.05} max={8} onChange={(value) => patchClip((clip) => { clip.transform.scale = value; })} onKeyframe={() => keyframe("scale", selectedClip.transform.scale)} />
              <NumberControl label="Rotation" helpId="inspector.rotation" value={selectedClip.transform.rotation} step={0.1} onChange={(value) => patchClip((clip) => { clip.transform.rotation = value; })} onKeyframe={() => keyframe("rotation", selectedClip.transform.rotation)} />
              <NumberControl label="Opacity" helpId="inspector.opacity" value={selectedClip.transform.opacity} step={0.01} min={0} max={1} onChange={(value) => patchClip((clip) => { clip.transform.opacity = value; })} onKeyframe={() => keyframe("opacity", selectedClip.transform.opacity)} />
              {selectedClip.kind === "media" && <label className="inspector-control" data-help-id="inspector.fit"><span>Fit</span><select value={selectedClip.transform.fit} onChange={(event) => patchClip((clip) => { clip.transform.fit = event.target.value as "cover" | "contain"; })}><option value="cover">Cover</option><option value="contain">Contain</option></select></label>}
            </div>
          </section>
          <section className="inspector-section inspector-section--open">
            <h3>Timing</h3>
            <div className="control-grid">
              <NumberControl label="Timeline start" helpId="inspector.timelineStart" value={selectedClip.timelineStart} step={1 / sequence.fps} min={0} max={sequence.duration} onChange={(value) => patchClip((clip) => { clip.timelineStart = Math.max(0, value); })} />
              <NumberControl label="Duration" helpId="inspector.duration" value={selectedClip.duration} step={1 / sequence.fps} min={1 / sequence.fps} max={sequence.duration} onChange={(value) => patchClip((clip) => { clip.duration = Math.max(1 / sequence.fps, value); })} />
              {selectedClip.kind === "media" && <>
                <NumberControl label="Source in" helpId="inspector.sourceIn" value={selectedClip.sourceIn} step={1 / sequence.fps} min={0} onChange={(value) => patchClip((clip) => { clip.sourceIn = Math.max(0, value); })} />
                <NumberControl label="Speed" helpId="inspector.speed" value={selectedClip.playbackRate} step={0.05} min={0.05} max={8} onChange={(value) => patchClip((clip) => { clip.playbackRate = value; })} />
              </>}
              <NumberControl label="Fade in" helpId="inspector.fadeIn" value={selectedClip.fadeIn} step={0.05} min={0} onChange={(value) => patchClip((clip) => { clip.fadeIn = value; })} />
              <NumberControl label="Fade out" helpId="inspector.fadeOut" value={selectedClip.fadeOut} step={0.05} min={0} onChange={(value) => patchClip((clip) => { clip.fadeOut = value; })} />
            </div>
          </section>
          <section className="inspector-section">
            <h3>Audio</h3>
            <NumberControl label="Gain" helpId="inspector.audioGain" value={selectedClip.audioGain} step={0.05} min={0} max={4} onChange={(value) => patchClip((clip) => { clip.audioGain = value; })} />
          </section>
          <section className="keyframe-summary"><span>{Object.values(selectedClip.keyframes).flat().length} keyframes</span><span>{selectedClip.enabled ? "Layer enabled" : "Layer disabled"}</span></section>
        </div> : <div className="inspector-empty"><Icon name="settings" /><strong>No layer selected</strong><span>Select a clip or layer to inspect every editable property.</span></div>
      ) : (
        <div className="inspector-scroll">
          <section className="inspector-section inspector-section--open">
            <h3>Sequence</h3>
            <label className="inspector-control" data-help-id="inspector.aspectRatio"><span>Aspect ratio</span><select value={sequence.id} onChange={(event) => commit("Switch sequence", (draft) => { draft.activeSequenceId = event.target.value; })}>{project.sequences.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.aspectRatio} · {candidate.width}×{candidate.height}</option>)}</select></label>
            <NumberControl label="Duration" helpId="inspector.sequenceDuration" value={sequence.duration} step={0.1} min={0.1} max={3600} onChange={(value) => updateSequence((target) => { target.duration = value; })} />
            <NumberControl label="Frame rate" helpId="inspector.frameRate" value={sequence.fps} min={1} max={120} onChange={(value) => updateSequence((target) => { target.fps = value; })} />
            <ColorControl label="Background" helpId="inspector.background" value={sequence.background} onChange={(value) => updateSequence((target) => { target.background = value; })} />
          </section>
          <section className="inspector-section inspector-section--open">
            <h3>Audio master</h3>
            <NumberControl label="Loudness target" helpId="inspector.loudness" value={project.renderSettings.loudnessTarget} step={0.5} min={-30} max={-5} onChange={(value) => commit("Change loudness", (draft) => { draft.renderSettings.loudnessTarget = value; })} />
            <NumberControl label="True peak" helpId="inspector.truePeak" value={project.renderSettings.truePeak} step={0.1} min={-9} max={0} onChange={(value) => commit("Change true peak", (draft) => { draft.renderSettings.truePeak = value; })} />
          </section>
          <div className="project-facts"><span>Schema</span><strong>HRC Recipe v{project.schemaVersion}</strong><span>Managed assets</span><strong>{project.assets.length}</strong><span>Sequences</span><strong>{project.sequences.length}</strong></div>
        </div>
      )}
    </aside>
  );
}

import { useEffect, useState } from "react";
import type { RenderPreset } from "../../shared/project.ts";
import { api, type RenderJobState } from "../lib/api.ts";
import { useEditor } from "../state/EditorContext.tsx";
import { Icon } from "./Icon.tsx";

const stages = ["Compiling", "Rendering", "QA", "Complete"];

export function RenderDialog({ open, preset, onPresetChange, onClose }: { open: boolean; preset: RenderPreset; onPresetChange: (preset: RenderPreset) => void; onClose: () => void }) {
  const { project, sequence, save } = useEditor();
  const [job, setJob] = useState<RenderJobState | null>(null);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!job || ["complete", "failed", "cancelled"].includes(job.stage)) return;
    const events = new EventSource(`/api/v1/renders/${job.id}/events`);
    events.onmessage = (event) => {
      const state = JSON.parse(event.data) as RenderJobState;
      setJob(state);
      if (["complete", "failed", "cancelled"].includes(state.stage)) events.close();
    };
    events.onerror = () => events.close();
    return () => events.close();
  }, [job?.id]);
  if (!open || !project || !sequence) return null;
  const start = async () => {
    setStarting(true);
    try {
      const saved = await save();
      if (!saved) return;
      setJob(await api.createRender(saved.id, sequence.id, preset));
    } finally {
      setStarting(false);
    }
  };
  const active = job && !["complete", "failed", "cancelled"].includes(job.stage);
  return <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Render project">
    <div className="modal-backdrop" onClick={() => !active && onClose()} />
    <section className="render-dialog" data-help-id="render.panel">
      <header><div><span className="render-mark"><Icon name="play" /></span><span><strong>Generate Reel</strong><small>Native FFmpeg render with retained manifests and QA evidence.</small></span></div><button className="icon-button" data-help-id="render.close" disabled={Boolean(active)} onClick={onClose}><Icon name="close" /></button></header>
      <div className="render-summary" data-help-id="render.summary">
        <span><small>Sequence</small><strong>{sequence.aspectRatio}</strong></span>
        <span><small>Resolution</small><strong>{sequence.width}×{sequence.height}</strong></span>
        <span><small>Frame rate</small><strong>{sequence.fps} fps</strong></span>
        <span><small>Duration</small><strong>{sequence.duration.toFixed(2)}s</strong></span>
      </div>
      <label className="render-preset" data-help-id="render.preset"><span>Output preset</span><select value={preset} disabled={Boolean(active)} onChange={(event) => onPresetChange(event.target.value as RenderPreset)}><option value="draft">Draft Preview</option><option value="review">Review MP4</option><option value="delivery">Delivery MP4</option><option value="archive">Archive ProRes</option><option value="webm">WebM</option><option value="gif">GIF</option><option value="webp">Animated WebP</option><option value="png">PNG Sequence ZIP</option></select></label>
      <div className="render-progress" data-help-id="render.progress">
        <div className="render-progress__head"><span>{job?.message || "Ready to render"}</span><strong>{Math.round((job?.progress || 0) * 100)}%</strong></div>
        <div className="progress-track"><i style={{ width: `${(job?.progress || 0) * 100}%` }} /></div>
        <div className="render-stages">{stages.map((stage, index) => {
          const order = job?.stage === "complete" ? 4 : job?.stage === "qa" ? 3 : job?.stage === "rendering" ? 2 : job?.stage === "compiling" ? 1 : 0;
          return <span key={stage} className={order > index ? "is-complete" : order === index ? "is-active" : ""}><i />{stage}</span>;
        })}</div>
      </div>
      {job?.error && <div className="render-error"><strong>Render failed</strong><pre>{job.error}</pre></div>}
      {job?.stage === "complete" && job.outputUrl && <div className="render-complete"><span className="signal-check">✓</span><div><strong>Master created and QA frames extracted.</strong><span>{job.outputFileName}</span></div><a data-help-id="render.download" href={job.outputUrl} download><Icon name="download" /> Download</a></div>}
      <footer>
        {active ? <button className="danger-button" data-help-id="render.cancel" onClick={() => void api.cancelRender(job.id)}>Cancel Render</button> : <button data-help-id="render.closeFooter" onClick={onClose}>Close</button>}
        <span />
        {!active && job?.stage !== "complete" && <button className="generate-button" data-help-id="render.start" disabled={starting} onClick={() => void start()}><Icon name="play" />{starting ? "Preparing…" : "Start Render"}</button>}
        {job?.stage === "complete" && <button className="primary-control" data-help-id="render.another" onClick={() => setJob(null)}>Render Another</button>}
      </footer>
    </section>
  </div>;
}

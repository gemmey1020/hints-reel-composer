import type { RenderPreset } from "../../shared/project.ts";
import { useEditor } from "../state/EditorContext.tsx";
import { Icon } from "./Icon.tsx";

interface TopBarProps {
  helpMode: boolean;
  onToggleHelp: () => void;
  onOpenScript: () => void;
  onGenerate: () => void;
  preset: RenderPreset;
  onPresetChange: (preset: RenderPreset) => void;
}

export function TopBar({ helpMode, onToggleHelp, onOpenScript, onGenerate, preset, onPresetChange }: TopBarProps) {
  const { project, sequence, saveState, commit, save, setActiveSequence } = useEditor();
  if (!project || !sequence) return null;
  return (
    <header className="topbar">
      <div className="brand-lockup" data-help-id="app.brand">
        <img src="/brand-assets/logo/full_wordmark_on_dark/hints-wordmark-on-dark.svg" alt="Hints" />
        <span className="product-name">Reel Composer</span>
      </div>
      <span className="topbar-divider" />
      <input
        className="project-title-input"
        data-help-id="app.projectTitle"
        value={project.title}
        aria-label="Project title"
        onChange={(event) => commit("Rename project", (draft) => { draft.title = event.target.value; })}
      />
      <div className="topbar-spacer" />
      <label className="sequence-picker" title="Switch the active output sequence" data-help-id="app.sequence">
        <span>Sequence</span>
        <select value={sequence.id} onChange={(event) => setActiveSequence(event.target.value)}>
          {project.sequences.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.aspectRatio}</option>)}
        </select>
      </label>
      <button className="toolbar-button" data-help-id="app.save" onClick={() => void save()} title="Save project now">
        <Icon name="save" />
        <span>Save</span>
      </button>
      <span className={`save-indicator save-indicator--${saveState}`} data-help-id="app.saveState">
        <i />{saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving" : saveState === "dirty" ? "Unsaved" : saveState}
      </span>
      <button className={`toolbar-button guide-toggle ${helpMode ? "is-active" : ""}`} data-help-id="app.guide" onClick={onToggleHelp} title="Toggle Guide Mode (?)">
        <Icon name="info" />
        <span>Guide</span>
      </button>
      <button className="toolbar-button" data-help-id="app.recipe" onClick={onOpenScript} title="Open synchronized HRC Recipe">
        <Icon name="script" />
        <span>Recipe</span>
      </button>
      <div className="generate-group">
        <button className="generate-button" data-help-id="app.generate" onClick={onGenerate}>
          <Icon name="play" />
          <span>Generate</span>
        </button>
        <select aria-label="Render preset" data-help-id="app.renderPreset" value={preset} onChange={(event) => onPresetChange(event.target.value as RenderPreset)}>
          <option value="draft">Draft</option>
          <option value="review">Review MP4</option>
          <option value="delivery">Delivery MP4</option>
          <option value="archive">Archive ProRes</option>
          <option value="webm">WebM</option>
          <option value="gif">GIF</option>
          <option value="webp">Animated WebP</option>
          <option value="png">PNG Sequence ZIP</option>
        </select>
      </div>
    </header>
  );
}

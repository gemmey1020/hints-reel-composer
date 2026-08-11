import { useEffect, useMemo, useRef, useState } from "react";
import { validateProject, type ReelProject } from "../../shared/project.ts";
import { downloadJson } from "../lib/editor.ts";
import { useEditor } from "../state/EditorContext.tsx";
import { Icon } from "./Icon.tsx";

export function ScriptDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, applyRecipe } = useEditor();
  const [source, setSource] = useState("");
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open && project && !dirty) setSource(JSON.stringify(project, null, 2));
  }, [open, project, dirty]);
  const parsed = useMemo(() => {
    try {
      const recipe = JSON.parse(source) as ReelProject;
      const validation = validateProject(recipe);
      return { recipe, errors: validation.errors };
    } catch (error) {
      return { recipe: null, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }, [source]);
  if (!project) return null;
  const currentClipCount = project.sequences.flatMap((sequence) => sequence.tracks.flatMap((track) => track.clips)).length;
  const nextClipCount = parsed.recipe?.sequences.flatMap((sequence) => sequence.tracks.flatMap((track) => track.clips)).length || 0;
  const apply = async () => {
    if (!parsed.recipe || parsed.errors.length > 0) return;
    setApplying(true);
    try {
      await applyRecipe(parsed.recipe);
      setDirty(false);
    } finally {
      setApplying(false);
    }
  };
  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setSource(await file.text());
    setDirty(true);
  };
  return <div className={`script-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
    <div className="drawer-backdrop" onClick={onClose} />
    <section className="drawer-sheet" data-help-id="recipe.panel">
      <header>
        <div><Icon name="script" /><span><strong>HRC Recipe</strong><small>Visual timeline and machine-readable project stay synchronized.</small></span></div>
        <button className="icon-button" data-help-id="recipe.close" onClick={onClose} aria-label="Close recipe drawer"><Icon name="close" /></button>
      </header>
      <div className="recipe-statusbar" data-help-id="recipe.status">
        <span className={parsed.errors.length ? "recipe-invalid" : "recipe-valid"}>{parsed.errors.length ? `${parsed.errors.length} validation issue${parsed.errors.length > 1 ? "s" : ""}` : "Recipe valid"}</span>
        <span>{project.assets.length} assets</span>
        <span>{currentClipCount} → {nextClipCount} clips</span>
        <span>{project.sequences.length} sequences</span>
      </div>
      <div className="recipe-editor" data-help-id="recipe.editor">
        <div className="recipe-gutter" aria-hidden="true">{source.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div>
        <textarea spellCheck={false} value={source} onChange={(event) => { setSource(event.target.value); setDirty(true); }} aria-label="HRC Recipe JSON" />
      </div>
      <div className="recipe-errors" data-help-id="recipe.validation">
        {parsed.errors.slice(0, 4).map((error) => <span key={error}>{error}</span>)}
        {!parsed.errors.length && <span>Schema v1 · Safe paths only · No shell commands</span>}
      </div>
      <footer>
        <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void loadFile(event.target.files?.[0])} />
        <button data-help-id="recipe.import" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Import Recipe</button>
        <button data-help-id="recipe.export" onClick={() => downloadJson(project)}><Icon name="download" /> Export Recipe</button>
        <span />
        <button data-help-id="recipe.reset" onClick={() => { setSource(JSON.stringify(project, null, 2)); setDirty(false); }}>Reset to Visual</button>
        <button className="primary-control" data-help-id="recipe.apply" disabled={Boolean(parsed.errors.length) || applying || !dirty} onClick={() => void apply()}>{applying ? "Applying…" : "Validate & Apply"}</button>
      </footer>
    </section>
  </div>;
}

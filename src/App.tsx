import { useEffect, useState } from "react";
import type { RenderPreset } from "../shared/project.ts";
import { api } from "./lib/api.ts";
import { EditorProvider, useEditor } from "./state/EditorContext.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { MediaBin } from "./components/MediaBin.tsx";
import { PreviewStage } from "./components/PreviewStage.tsx";
import { RenderDialog } from "./components/RenderDialog.tsx";
import { ScriptDrawer } from "./components/ScriptDrawer.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { Icon } from "./components/Icon.tsx";
import { HelpSystem } from "./help/HelpSystem.tsx";

function EditorShell() {
  const { project, error, dismissError, undo, redo, splitSelectedClip, duplicateSelectedClip, deleteSelectedClip, togglePlayback, save } = useEditor();
  const [helpMode, setHelpMode] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [renderOpen, setRenderOpen] = useState(false);
  const [preset, setPreset] = useState<RenderPreset>("review");
  const [toolsReady, setToolsReady] = useState<boolean | null>(null);

  useEffect(() => { void api.health().then((health) => setToolsReady(health.ffmpeg !== "unavailable")).catch(() => setToolsReady(false)); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
      else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z") { event.preventDefault(); redo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelectedClip(); }
      else if (event.key === "?") { event.preventDefault(); setHelpMode((value) => !value); }
      else if (event.key.toLowerCase() === "s") splitSelectedClip();
      else if (event.key === "Delete" || event.key === "Backspace") deleteSelectedClip();
      else if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, splitSelectedClip, duplicateSelectedClip, deleteSelectedClip, togglePlayback, save]);

  if (!project) return <div className="app-loader"><span className="loader-signal" /><strong>Loading Hints Reel Composer</strong><span>Opening the local production workspace…</span></div>;
  return <div className={`composer-app ${helpMode ? "show-help" : ""}`}>
    <TopBar helpMode={helpMode} onToggleHelp={() => setHelpMode((value) => !value)} onOpenScript={() => setScriptOpen(true)} onGenerate={() => setRenderOpen(true)} preset={preset} onPresetChange={setPreset} />
    {helpMode && <div className="help-ribbon"><Icon name="info" /><span>Guide Mode is active. Press any floating info mark. Shift + Click remains available outside the Timeline.</span><button onClick={() => setHelpMode(false)}>Hide</button></div>}
    <main className="editor-grid">
      <MediaBin />
      <PreviewStage />
      <Inspector />
      <Timeline />
    </main>
    <footer className="statusbar">
      <span data-help-id="app.status.tools"><i className={toolsReady ? "status-ok" : toolsReady === false ? "status-error" : ""} />{toolsReady ? "Native render stack online" : toolsReady === false ? "Render stack unavailable" : "Checking tools…"}</span>
      <span data-help-id="app.status.recipe">HRC Recipe v{project.schemaVersion}</span>
      <span data-help-id="app.status.assets">{project.assets.length} managed assets</span>
      <span className="statusbar-spacer" />
      <span data-help-id="app.status.local">Local-only · No publishing</span>
    </footer>
    <ScriptDrawer open={scriptOpen} onClose={() => setScriptOpen(false)} />
    <RenderDialog open={renderOpen} preset={preset} onPresetChange={setPreset} onClose={() => setRenderOpen(false)} />
    {error && <div className="error-toast" data-help-id="error.toast"><Icon name="info" /><span><strong>Composer needs attention</strong>{error}</span><button data-help-id="error.dismiss" onClick={dismissError}><Icon name="close" /></button></div>}
    <HelpSystem guideMode={helpMode} onGuideModeChange={setHelpMode} />
  </div>;
}

export default function App() {
  return <EditorProvider><EditorShell /></EditorProvider>;
}

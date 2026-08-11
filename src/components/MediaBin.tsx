import { useRef, useState } from "react";
import type { AssetKind } from "../../shared/project.ts";
import { formatTimecode } from "../lib/editor.ts";
import { useEditor } from "../state/EditorContext.tsx";
import { Icon } from "./Icon.tsx";

type MediaFilter = "all" | AssetKind;

export function MediaBin() {
  const { project, sequence, importFiles, addAssetToTimeline, addTextToTimeline, addSignalToTimeline, saveState } = useEditor();
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  if (!project || !sequence) return null;
  const assets = project.assets.filter((asset) => (filter === "all" || asset.kind === filter) && asset.name.toLowerCase().includes(query.toLowerCase()));
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await importFiles(Array.from(files));
    if (inputRef.current) inputRef.current.value = "";
  };
  return (
    <aside className="panel media-panel" data-help-id="media.panel">
      <div className="panel-heading">
        <div><strong>Media</strong><span>{project.assets.length} managed assets</span></div>
        <button className="icon-button" data-help-id="media.safety" title="Project media is copied and checksum protected"><Icon name="info" /></button>
      </div>
      <div className="media-actions">
        <input ref={inputRef} hidden multiple type="file" accept="video/*,audio/*,image/*" onChange={(event) => void onFiles(event.target.files)} />
        <button className="primary-control" data-help-id="media.import" onClick={() => inputRef.current?.click()} disabled={saveState === "saving"}>
          <Icon name="upload" />
          <span>{saveState === "saving" ? "Processing…" : "Import Media"}</span>
        </button>
        <div className="quick-create">
          <button data-help-id="media.addText" onClick={addTextToTimeline} title="Add editable brand text at the playhead"><Icon name="text" /> Text</button>
          <button data-help-id="media.addSignal" onClick={addSignalToTimeline} title="Add a Hints cyan signal layer"><Icon name="add" /> Signal</button>
        </div>
      </div>
      <div className="media-filters" data-help-id="media.filters" role="tablist" aria-label="Media filters">
        {(["all", "video", "audio", "image"] as MediaFilter[]).map((value) => (
          <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value[0].toUpperCase() + value.slice(1)}</button>
        ))}
      </div>
      <div className="media-search" data-help-id="media.search">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search project media" aria-label="Search media" />
      </div>
      <div className="asset-list">
        {assets.length === 0 && (
          <div className="empty-state">
            <Icon name="folder" />
            <strong>No media yet</strong>
            <span>Import Flow shots, audio, images, or local plates.</span>
          </div>
        )}
        {assets.map((asset) => (
          <button className="asset-row" data-help-id="media.asset" data-help-label={asset.name} key={asset.id} onClick={() => addAssetToTimeline(asset)}>
            <span className={`asset-thumb asset-thumb--${asset.kind}`}>
              {asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : asset.waveformUrl ? <img src={asset.waveformUrl} alt="" /> : <Icon name={asset.kind === "video" ? "video" : asset.kind === "audio" ? "audio" : "image"} />}
              {asset.duration > 0 && <small>{formatTimecode(asset.duration, asset.fps || 30).slice(0, 5)}</small>}
            </span>
            <span className="asset-copy">
              <strong>{asset.name}</strong>
              <span>{asset.kind.toUpperCase()} {asset.width ? `• ${asset.width}×${asset.height}` : ""}</span>
              <span>{asset.fps ? `${asset.fps.toFixed(2)} fps` : asset.audioSampleRate ? `${Math.round(asset.audioSampleRate / 1000)} kHz` : "Managed source"}</span>
            </span>
            <span className="asset-add"><Icon name="add" /></span>
          </button>
        ))}
      </div>
      <div className="panel-footnote" data-help-id="media.originals"><span className="signal-dot" /> Originals remain unchanged</div>
    </aside>
  );
}

import { createContext, useContext, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { createMediaClip, createTextClip, type MediaAsset, type ReelClip, type ReelProject, type ReelSequence, type ReelTrack } from "../../shared/project.ts";
import { api } from "../lib/api.ts";
import { activeSequence, cloneProject, getClip, mutateClipIfUnlocked } from "../lib/editor.ts";

interface HistoryState {
  past: ReelProject[];
  present: ReelProject;
  future: ReelProject[];
}

export type SaveState = "loading" | "saved" | "saving" | "dirty" | "error";

interface EditorContextValue {
  project: ReelProject | null;
  sequence: ReelSequence | null;
  selectedClip: ReelClip | null;
  selectedClipId: string | null;
  currentTime: number;
  playing: boolean;
  saveState: SaveState;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  setSelectedClipId: (clipId: string | null) => void;
  setCurrentTime: (time: number) => void;
  togglePlayback: () => void;
  stepFrame: (direction: -1 | 1) => void;
  commit: (label: string, updater: (draft: ReelProject) => void) => void;
  replaceProject: (project: ReelProject, recordHistory?: boolean) => void;
  updateClip: (clipId: string, updater: (clip: ReelClip) => void, label?: string) => void;
  updateSequence: (updater: (sequence: ReelSequence) => void, label?: string) => void;
  updateTrack: (trackId: string, updater: (track: ReelTrack) => void, label?: string) => void;
  toggleTrackFlag: (trackId: string, flag: "locked" | "hidden" | "muted" | "solo") => void;
  addAssetToTimeline: (asset: MediaAsset) => void;
  addTextToTimeline: () => void;
  addSignalToTimeline: () => void;
  splitSelectedClip: () => void;
  deleteSelectedClip: () => void;
  duplicateSelectedClip: () => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<ReelProject | null>;
  importFiles: (files: File[]) => Promise<void>;
  applyRecipe: (recipe: ReelProject) => Promise<void>;
  setActiveSequence: (sequenceId: string) => void;
  dismissError: () => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTimeState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [error, setError] = useState<string | null>(null);
  const dirtyRevision = useRef(0);
  const savedRevision = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const projects = await api.listProjects();
        const project = projects.length > 0 ? await api.getProject(projects[0].id) : await api.createProject("Untitled Reel");
        if (cancelled) return;
        setHistory({ past: [], present: project, future: [] });
        setSaveState("saved");
      } catch (reason) {
        if (!cancelled) {
          setSaveState("error");
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const project = history?.present || null;
  const sequence = project ? activeSequence(project) : null;
  const selectedClip = project ? getClip(project, selectedClipId) : null;

  const saveLatest = useEffectEvent(async (candidate: ReelProject, revision: number) => {
    try {
      setSaveState("saving");
      await api.saveProject(candidate);
      savedRevision.current = Math.max(savedRevision.current, revision);
      setSaveState(savedRevision.current >= dirtyRevision.current ? "saved" : "dirty");
    } catch (reason) {
      setSaveState("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  });

  useEffect(() => {
    if (!project || dirtyRevision.current <= savedRevision.current) return;
    const revision = dirtyRevision.current;
    const timeout = window.setTimeout(() => void saveLatest(project, revision), 1100);
    return () => window.clearTimeout(timeout);
  }, [project]);

  useEffect(() => {
    if (!playing || !sequence) return;
    const startedAt = performance.now();
    const initial = currentTime;
    let frame = 0;
    const tick = (now: number) => {
      const next = initial + (now - startedAt) / 1000;
      if (next >= sequence.duration) {
        setCurrentTimeState(sequence.duration);
        setPlaying(false);
        return;
      }
      setCurrentTimeState(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, sequence?.id]);

  const commit = (label: string, updater: (draft: ReelProject) => void) => {
    void label;
    setHistory((current) => {
      if (!current) return current;
      const next = cloneProject(current.present);
      updater(next);
      next.updatedAt = new Date().toISOString();
      dirtyRevision.current += 1;
      setSaveState("dirty");
      return { past: [...current.past.slice(-79), current.present], present: next, future: [] };
    });
  };

  const replaceProject = (next: ReelProject, recordHistory = true) => {
    setHistory((current) => {
      if (!current || !recordHistory) return { past: [], present: next, future: [] };
      return { past: [...current.past.slice(-79), current.present], present: next, future: [] };
    });
    dirtyRevision.current += 1;
    setSaveState("dirty");
    setSelectedClipId(null);
    setCurrentTimeState(0);
  };

  const updateClip = (clipId: string, updater: (clip: ReelClip) => void, label = "Update clip") => {
    if (!project || !project.sequences.some((targetSequence) => targetSequence.tracks.some((track) => !track.locked && track.clips.some((clip) => clip.id === clipId)))) return;
    commit(label, (draft) => {
      mutateClipIfUnlocked(draft, clipId, updater);
    });
  };

  const updateSequence = (updater: (target: ReelSequence) => void, label = "Update sequence") => {
    if (!project) return;
    const sequenceId = project.activeSequenceId;
    commit(label, (draft) => {
      const target = draft.sequences.find((candidate) => candidate.id === sequenceId);
      if (target) updater(target);
    });
  };

  const updateTrack = (trackId: string, updater: (track: ReelTrack) => void, label = "Update track") => {
    const currentTrack = sequence?.tracks.find((candidate) => candidate.id === trackId);
    if (!currentTrack || currentTrack.locked) return;
    updateSequence((target) => {
      const track = target.tracks.find((candidate) => candidate.id === trackId);
      if (track && !track.locked) updater(track);
    }, label);
  };

  const toggleTrackFlag = (trackId: string, flag: "locked" | "hidden" | "muted" | "solo") => {
    updateSequence((target) => {
      const track = target.tracks.find((candidate) => candidate.id === trackId);
      if (track) track[flag] = !track[flag];
    }, `Toggle track ${flag}`);
  };

  const addAssetToTimeline = (asset: MediaAsset) => {
    if (!sequence) return;
    const track = asset.kind === "audio"
      ? sequence.tracks.find((candidate) => candidate.kind === "audio" && !candidate.locked)
      : sequence.tracks.find((candidate) => candidate.kind === "video" && !candidate.locked);
    if (!track) return;
    const clip = createMediaClip(asset, track.id, Math.min(currentTime, Math.max(0, sequence.duration - 0.1)));
    clip.duration = Math.min(clip.duration, Math.max(0.1, sequence.duration - clip.timelineStart));
    updateTrack(track.id, (target) => target.clips.push(clip), "Add media");
    setSelectedClipId(clip.id);
  };

  const addTextToTimeline = () => {
    if (!sequence) return;
    const track = [...sequence.tracks].sort((a, b) => b.order - a.order).find((candidate) => candidate.kind === "graphics" && !candidate.locked);
    if (!track) return;
    const clip = createTextClip(track.id, currentTime, Math.min(4, sequence.duration - currentTime));
    updateTrack(track.id, (target) => target.clips.push(clip), "Add text");
    setSelectedClipId(clip.id);
  };

  const addSignalToTimeline = () => {
    if (!sequence) return;
    const graphicsTracks = sequence.tracks.filter((candidate) => candidate.kind === "graphics" && !candidate.locked).sort((a, b) => a.order - b.order);
    const track = graphicsTracks[0];
    if (!track) return;
    const clip: ReelClip = {
      id: crypto.randomUUID(), trackId: track.id, kind: "shape", name: "Cyan Signal",
      timelineStart: currentTime, duration: Math.min(3, sequence.duration - currentTime), sourceIn: 0, playbackRate: 1, enabled: true,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: "contain" },
      shape: { type: "line", color: "#74f4ff", width: sequence.width * 0.78, height: Math.max(2, Math.round(sequence.width / 540)) },
      audioGain: 1, fadeIn: 0.15, fadeOut: 0.15, keyframes: {}
    };
    updateTrack(track.id, (target) => target.clips.push(clip), "Add signal");
    setSelectedClipId(clip.id);
  };

  const splitSelectedClip = () => {
    if (!selectedClip || !sequence) return;
    if (sequence.tracks.find((track) => track.id === selectedClip.trackId)?.locked) return;
    const splitOffset = currentTime - selectedClip.timelineStart;
    if (splitOffset <= 1 / sequence.fps || splitOffset >= selectedClip.duration - 1 / sequence.fps) return;
    const originalId = selectedClip.id;
    commit("Split clip", (draft) => {
      const target = getClip(draft, originalId);
      if (!target) return;
      const track = activeSequence(draft).tracks.find((candidate) => candidate.id === target.trackId);
      if (!track || track.locked) return;
      const right = structuredClone(target);
      right.id = crypto.randomUUID();
      right.name = `${target.name} B`;
      right.timelineStart = currentTime;
      right.duration = target.duration - splitOffset;
      right.sourceIn = target.sourceIn + splitOffset * target.playbackRate;
      target.duration = splitOffset;
      track.clips.push(right);
      setSelectedClipId(right.id);
    });
  };

  const deleteSelectedClip = () => {
    if (!selectedClipId) return;
    if (sequence?.tracks.some((track) => track.locked && track.clips.some((clip) => clip.id === selectedClipId))) return;
    const id = selectedClipId;
    commit("Delete clip", (draft) => {
      for (const targetSequence of draft.sequences) {
        for (const track of targetSequence.tracks) {
          if (!track.locked) track.clips = track.clips.filter((clip) => clip.id !== id);
        }
      }
    });
    setSelectedClipId(null);
  };

  const duplicateSelectedClip = () => {
    if (!selectedClip || !sequence) return;
    if (sequence.tracks.find((track) => track.id === selectedClip.trackId)?.locked) return;
    const source = selectedClip;
    const duplicate = structuredClone(source);
    duplicate.id = crypto.randomUUID();
    duplicate.name = `${source.name} Copy`;
    duplicate.timelineStart = Math.min(sequence.duration - duplicate.duration, source.timelineStart + source.duration + 1 / sequence.fps);
    updateTrack(source.trackId, (track) => track.clips.push(duplicate), "Duplicate clip");
    setSelectedClipId(duplicate.id);
  };

  const undo = () => setHistory((current) => {
    if (!current || current.past.length === 0) return current;
    const previous = current.past[current.past.length - 1];
    dirtyRevision.current += 1;
    setSaveState("dirty");
    return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] };
  });

  const redo = () => setHistory((current) => {
    if (!current || current.future.length === 0) return current;
    const next = current.future[0];
    dirtyRevision.current += 1;
    setSaveState("dirty");
    return { past: [...current.past, current.present], present: next, future: current.future.slice(1) };
  });

  const save = async () => {
    if (!project) return null;
    try {
      setSaveState("saving");
      const saved = await api.saveProject(project);
      savedRevision.current = dirtyRevision.current;
      setSaveState("saved");
      return saved;
    } catch (reason) {
      setSaveState("error");
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    }
  };

  const importFiles = async (files: File[]) => {
    if (!project || files.length === 0) return;
    try {
      setSaveState("saving");
      await api.saveProject(project);
      let latest = project;
      for (const file of files) {
        const result = await api.importMedia(latest.id, file);
        latest = result.project;
      }
      setHistory((current) => current ? { past: [...current.past, current.present], present: latest, future: [] } : current);
      savedRevision.current = dirtyRevision.current;
      setSaveState("saved");
    } catch (reason) {
      setSaveState("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const applyRecipe = async (recipe: ReelProject) => {
    if (!project) return;
    try {
      setSaveState("saving");
      const imported = await api.importRecipe(project.id, recipe);
      replaceProject(imported);
      savedRevision.current = dirtyRevision.current;
      setSaveState("saved");
    } catch (reason) {
      setSaveState("error");
      setError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    }
  };

  const setCurrentTime = (time: number) => setCurrentTimeState(Math.max(0, Math.min(sequence?.duration || 0, time)));
  const stepFrame = (direction: -1 | 1) => {
    setPlaying(false);
    setCurrentTime(currentTime + direction / (sequence?.fps || 30));
  };

  const setActiveSequence = (sequenceId: string) => {
    commit("Switch sequence", (draft) => { draft.activeSequenceId = sequenceId; });
    setCurrentTimeState(0);
    setSelectedClipId(null);
  };

  const value = useMemo<EditorContextValue>(() => ({
    project, sequence, selectedClip, selectedClipId, currentTime, playing, saveState, error,
    canUndo: Boolean(history?.past.length), canRedo: Boolean(history?.future.length),
    setSelectedClipId, setCurrentTime, togglePlayback: () => setPlaying((value) => !value), stepFrame,
    commit, replaceProject, updateClip, updateSequence, updateTrack, toggleTrackFlag, addAssetToTimeline, addTextToTimeline,
    addSignalToTimeline, splitSelectedClip, deleteSelectedClip, duplicateSelectedClip, undo, redo, save,
    importFiles, applyRecipe, setActiveSequence, dismissError: () => setError(null)
  }), [project, sequence, selectedClip, selectedClipId, currentTime, playing, saveState, error, history?.past.length, history?.future.length]);

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) throw new Error("useEditor must be used inside EditorProvider.");
  return context;
}

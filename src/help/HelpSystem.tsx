import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HELP_REGISTRY, getHelpEntry, type HelpEntry } from "./helpRegistry.ts";
import { Icon } from "../components/Icon.tsx";

interface HelpMarker {
  key: string;
  id: string;
  element: HTMLElement;
  left: number;
  top: number;
}

interface ActiveHelp {
  entry: HelpEntry;
  element: HTMLElement;
  contextLabel?: string;
}

export function helpIdForGesture({ shiftKey, button, helpId, blocked }: { shiftKey: boolean; button: number; helpId?: string; blocked: boolean }) {
  return shiftKey && button === 0 && helpId && !blocked ? helpId : null;
}

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const inViewport = rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
  const hiddenTrim = element.matches(".trim-handle") && !element.parentElement?.classList.contains("is-selected");
  return rect.width > 0 && rect.height > 0 && inViewport && !hiddenTrim && style.display !== "none" && style.visibility !== "hidden" && !element.closest('[aria-hidden="true"]');
}

export function HelpSystem({ guideMode, onGuideModeChange }: { guideMode: boolean; onGuideModeChange: (value: boolean) => void }) {
  const [markers, setMarkers] = useState<HelpMarker[]>([]);
  const [active, setActive] = useState<ActiveHelp | null>(null);
  const [pinned, setPinned] = useState(false);
  const activeElementRef = useRef<HTMLElement | null>(null);

  const clearHighlight = useCallback(() => {
    activeElementRef.current?.classList.remove("help-target-active", "help-target-pulse");
    activeElementRef.current = null;
  }, []);

  const close = useCallback(() => {
    clearHighlight();
    setActive(null);
    setPinned(false);
  }, [clearHighlight]);

  const open = useCallback((id: string, element: HTMLElement) => {
    const entry = getHelpEntry(id);
    if (!entry) return;
    clearHighlight();
    activeElementRef.current = element;
    element.classList.add("help-target-active");
    setActive({ entry, element, contextLabel: element.dataset.helpLabel });
    setPinned(false);
  }, [clearHighlight]);

  const refreshMarkers = useCallback(() => {
    if (!guideMode) {
      setMarkers([]);
      return;
    }
    const activeSurface = document.querySelector<HTMLElement>(".modal-shell .render-dialog, .script-drawer.is-open .drawer-sheet");
    const candidates = activeSurface
      ? [activeSurface, ...Array.from(activeSurface.querySelectorAll<HTMLElement>("[data-help-id]"))]
      : Array.from(document.querySelectorAll<HTMLElement>("[data-help-id]"));
    const next = candidates
      .filter((element) => !element.closest(".ghost-info-card, .guide-marker-layer") && isVisible(element))
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        const id = element.dataset.helpId || "";
        return {
          key: `${id}-${index}`,
          id,
          element,
          left: Math.min(window.innerWidth - 24, Math.max(6, rect.right - 10)),
          top: Math.min(window.innerHeight - 24, Math.max(6, rect.top - 8))
        };
      })
      .filter((marker) => HELP_REGISTRY.has(marker.id));
    setMarkers(next);
  }, [guideMode]);

  useEffect(() => {
    refreshMarkers();
    if (!guideMode) return;
    const observer = new MutationObserver(refreshMarkers);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-hidden"] });
    const onViewportChange = () => requestAnimationFrame(refreshMarkers);
    window.addEventListener("resize", onViewportChange);
    document.addEventListener("scroll", onViewportChange, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onViewportChange);
      document.removeEventListener("scroll", onViewportChange, true);
    };
  }, [guideMode, refreshMarkers]);

  useEffect(() => {
    const onShiftClick = (event: MouseEvent) => {
      const source = event.target instanceof Element ? event.target : null;
      if (!source || source.closest(".ghost-info-card, .guide-marker-layer")) return;
      const target = source.closest<HTMLElement>("[data-help-id]");
      const id = helpIdForGesture({
        shiftKey: event.shiftKey,
        button: event.button,
        helpId: target?.dataset.helpId,
        blocked: Boolean(source.closest('[data-help-shift="off"]'))
      });
      if (!target || !id) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      open(id, target);
    };
    document.addEventListener("click", onShiftClick, true);
    return () => document.removeEventListener("click", onShiftClick, true);
  }, [open]);

  useEffect(() => {
    if (!active || pinned) return;
    const onPointerDown = (event: PointerEvent) => {
      const source = event.target instanceof Element ? event.target : null;
      if (!source || source.closest(".ghost-info-card, .guide-marker-layer") || source === active.element || active.element.contains(source)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [active, close, pinned]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && active) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, close]);

  useEffect(() => () => clearHighlight(), [clearHighlight]);

  const activeIndex = useMemo(() => active ? markers.findIndex((marker) => marker.element === active.element) : -1, [active, markers]);
  const next = () => {
    if (!markers.length) return;
    const marker = markers[(activeIndex + 1 + markers.length) % markers.length];
    open(marker.id, marker.element);
  };
  const locate = () => {
    if (!active) return;
    active.element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    active.element.classList.remove("help-target-pulse");
    requestAnimationFrame(() => active.element.classList.add("help-target-pulse"));
  };

  return <>
    {guideMode && <div className="guide-marker-layer" aria-label="Guide markers">
      {markers.map((marker) => <button
        key={marker.key}
        className="guide-marker"
        style={{ left: marker.left, top: marker.top }}
        aria-label={`Explain ${getHelpEntry(marker.id)?.title || marker.id}`}
        onClick={(event) => { event.stopPropagation(); open(marker.id, marker.element); }}
      ><Icon name="info" /></button>)}
    </div>}
    {active && <section className={`ghost-info-card ${pinned ? "is-pinned" : ""}`} role="dialog" aria-live="polite" aria-label={`Guide: ${active.entry.title}`} dir="rtl">
      <div className="ghost-info-card__signal" />
      <header>
        <span className="ghost-info-card__eyebrow">HINTS GUIDE</span>
        <button onClick={close} aria-label="Close guide"><Icon name="close" /></button>
      </header>
      <div className="ghost-info-card__title">
        <span><Icon name="info" /></span>
        <div><strong>{active.entry.title}</strong>{active.contextLabel && <small>{active.contextLabel}</small>}</div>
      </div>
      <p className="ghost-info-card__summary">{active.entry.summary}</p>
      <dl>
        <div><dt>متى تستخدمها؟</dt><dd>{active.entry.useWhen}</dd></div>
        <div><dt>تأثيرها</dt><dd>{active.entry.effect}</dd></div>
        {active.entry.example && <div><dt>مثال</dt><dd>{active.entry.example}</dd></div>}
        {active.entry.caution && <div className="is-caution"><dt>انتبه</dt><dd>{active.entry.caution}</dd></div>}
      </dl>
      {active.entry.shortcut && <div className="ghost-info-card__shortcut"><span>Shortcut</span><kbd>{active.entry.shortcut}</kbd></div>}
      <footer>
        <button className={pinned ? "is-active" : ""} onClick={() => setPinned((value) => !value)}>{pinned ? "مثبتة" : "تثبيت"}</button>
        <button onClick={locate}>أظهر مكانها</button>
        {guideMode && <button onClick={next}>التالي</button>}
        <button className="ghost-info-card__done" onClick={close}>فهمت</button>
      </footer>
    </section>}
    {!guideMode && !active && <button className="guide-quick-hint" onClick={() => onGuideModeChange(true)} title="Open Hints Guide Mode"><span>?</span><small>Shift + Click for info</small></button>}
  </>;
}

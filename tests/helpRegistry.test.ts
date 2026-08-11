import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HELP_ENTRIES, HELP_REGISTRY } from "../src/help/helpRegistry.ts";
import { helpIdForGesture } from "../src/help/HelpSystem.tsx";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

function usedHelpIds() {
  const ids = new Set<string>();
  for (const file of sourceFiles(join(process.cwd(), "src"))) {
    const source = readFileSync(file, "utf8");
    for (const pattern of [/data-help-id="([^"]+)"/g, /helpId="([^"]+)"/g]) {
      for (const match of source.matchAll(pattern)) ids.add(match[1]);
    }
  }
  return ids;
}

describe("Hints Guide registry", () => {
  it("provides complete, unique instructional entries", () => {
    expect(HELP_ENTRIES.length).toBeGreaterThanOrEqual(80);
    expect(HELP_REGISTRY.size).toBe(HELP_ENTRIES.length);
    for (const entry of HELP_ENTRIES) {
      expect(entry.id).toMatch(/^[a-z]+\.[A-Za-z]+/);
      expect(entry.title.length).toBeGreaterThan(2);
      expect(entry.summary.length).toBeGreaterThan(12);
      expect(entry.useWhen.length).toBeGreaterThan(12);
      expect(entry.effect.length).toBeGreaterThan(12);
    }
  });

  it("defines every help id referenced by the interface", () => {
    const missing = [...usedHelpIds()].filter((id) => !HELP_REGISTRY.has(id));
    expect(missing).toEqual([]);
  });

  it("opens quick help only for a safe Shift + primary click gesture", () => {
    expect(helpIdForGesture({ shiftKey: true, button: 0, helpId: "media.addText", blocked: false })).toBe("media.addText");
    expect(helpIdForGesture({ shiftKey: false, button: 0, helpId: "media.addText", blocked: false })).toBeNull();
    expect(helpIdForGesture({ shiftKey: true, button: 2, helpId: "media.addText", blocked: false })).toBeNull();
    expect(helpIdForGesture({ shiftKey: true, button: 0, helpId: "timeline.clip", blocked: true })).toBeNull();
  });
});

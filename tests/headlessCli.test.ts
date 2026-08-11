import { describe, expect, it, vi } from "vitest";
import { parseCliArguments, runCli } from "../scripts/hrc.ts";

describe("HRC headless CLI", () => {
  it("parses nested recipe commands and machine output mode", () => {
    expect(parseCliArguments(["recipe", "apply", "--project", "project-one", "--file", "/tmp/reel.json", "--json"]))
      .toMatchObject({ command: "recipe-apply", json: true, options: { project: "project-one", file: "/tmp/reel.json" } });
  });

  it("calls the governed API instead of duplicating render logic", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8090/api/v1/renders");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ projectId: "project-one", sequenceId: "sequence-one", preset: "review" });
      return new Response(JSON.stringify({ id: "job-one", stage: "queued" }), { status: 202, headers: { "Content-Type": "application/json" } });
    });
    const output: string[] = [];

    const exitCode = await runCli([
      "render", "--project", "project-one", "--sequence", "sequence-one", "--preset", "review", "--json"
    ], { fetchImpl: fetchImpl as typeof fetch, write: (value) => output.push(value) });

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output.join(""))).toMatchObject({ id: "job-one", stage: "queued" });
  });
});

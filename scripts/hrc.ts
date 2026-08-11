#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type CliOptions = Record<string, string | boolean>;

export interface ParsedCliArguments {
  command: string;
  options: CliOptions;
  json: boolean;
  baseUrl: string;
}

export interface CliDependencies {
  fetchImpl?: typeof fetch;
  write?: (value: string) => void;
  writeError?: (value: string) => void;
}

const COMMAND_ALIASES: Record<string, string> = {
  "recipe apply": "recipe-apply",
  "recipe export": "recipe-export"
};

export function parseCliArguments(argv: string[]): ParsedCliArguments {
  const words: string[] = [];
  const options: CliOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      words.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    const key = token.slice(2, equals >= 0 ? equals : undefined);
    if (!key) throw new Error("Invalid empty option.");
    if (equals >= 0) {
      options[key] = token.slice(equals + 1);
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      options[key] = argv[index + 1];
      index += 1;
    } else {
      options[key] = true;
    }
  }
  const compound = words.slice(0, 2).join(" ");
  const command = COMMAND_ALIASES[compound] || words[0] || "help";
  const baseUrl = String(options.url || process.env.HRC_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
  return { command, options, json: options.json === true, baseUrl };
}

function required(options: CliOptions, key: string): string {
  const value = options[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`--${key} is required.`);
  return value;
}

async function jsonRequest(fetchImpl: typeof fetch, baseUrl: string, endpoint: string, init?: RequestInit): Promise<unknown> {
  const response = await fetchImpl(`${baseUrl}${endpoint}`, init);
  const payload = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) {
    const record = payload as { error?: string; errors?: string[] };
    throw new Error(record.error || record.errors?.join("\n") || `Request failed with status ${response.status}.`);
  }
  return payload;
}

async function readRecipe(fileName: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path.resolve(fileName), "utf8"));
}

async function download(fetchImpl: typeof fetch, baseUrl: string, endpoint: string, destination: string): Promise<{ file: string; bytes: number }> {
  const response = await fetchImpl(`${baseUrl}${endpoint}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
    throw new Error(payload.error || `Download failed with status ${response.status}.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const target = path.resolve(destination);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  return { file: target, bytes: bytes.length };
}

async function waitForRender(fetchImpl: typeof fetch, baseUrl: string, jobId: string, timeoutMs: number): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await jsonRequest(fetchImpl, baseUrl, `/api/v1/renders/${jobId}`) as { stage?: string; error?: string };
    if (["complete", "failed", "cancelled"].includes(job.stage || "")) return job;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for render ${jobId}.`);
}

const HELP = `Hints Reel Composer headless operator

Commands:
  hrc create --title <title> [--json]
  hrc projects [--json]
  hrc get --project <id> [--json]
  hrc import --project <id> --file <path> [--role source-media] [--json]
  hrc recipe apply --project <id> --file <recipe.json> [--json]
  hrc recipe export --project <id> --out <recipe.json> [--json]
  hrc validate --file <recipe.json> [--json]
  hrc render --project <id> --sequence <id> --preset <preset> [--wait] [--json]
  hrc status --job <id> [--json]
  hrc retry --job <id> [--json]
  hrc cancel --job <id> [--json]
  hrc qa --job <id> [--json]
  hrc output --job <id> --out <file> [--json]
  hrc provenance --job <id> --out <file.zip> [--json]
  hrc health [--json]

Use --url to override http://127.0.0.1:8090.`;

export async function runCli(argv: string[], dependencies: CliDependencies = {}): Promise<number> {
  const parsed = parseCliArguments(argv);
  const fetchImpl = dependencies.fetchImpl || fetch;
  const write = dependencies.write || ((value: string) => process.stdout.write(value));
  const writeError = dependencies.writeError || ((value: string) => process.stderr.write(value));
  try {
    const { command, options, baseUrl } = parsed;
    let result: unknown;
    if (command === "help" || command === "--help") {
      write(`${HELP}\n`);
      return 0;
    }
    if (command === "health") result = await jsonRequest(fetchImpl, baseUrl, "/api/v1/health");
    else if (command === "projects") result = await jsonRequest(fetchImpl, baseUrl, "/api/v1/projects");
    else if (command === "create") result = await jsonRequest(fetchImpl, baseUrl, "/api/v1/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: String(options.title || "Untitled Reel") })
    });
    else if (command === "get") result = await jsonRequest(fetchImpl, baseUrl, `/api/v1/projects/${required(options, "project")}`);
    else if (command === "validate") result = await jsonRequest(fetchImpl, baseUrl, "/api/v1/validate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(await readRecipe(required(options, "file")))
    });
    else if (command === "recipe-apply") result = await jsonRequest(fetchImpl, baseUrl, `/api/v1/projects/${required(options, "project")}/import-recipe`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(await readRecipe(required(options, "file")))
    });
    else if (command === "recipe-export") {
      const projectId = required(options, "project");
      const recipe = await jsonRequest(fetchImpl, baseUrl, `/api/v1/projects/${projectId}/export-recipe`);
      const target = path.resolve(required(options, "out"));
      await fs.mkdir(path.dirname(target), { recursive: true });
      const serialized = `${JSON.stringify(recipe, null, 2)}\n`;
      await fs.writeFile(target, serialized, "utf8");
      result = { file: target, bytes: Buffer.byteLength(serialized) };
    } else if (command === "import") {
      const fileName = path.resolve(required(options, "file"));
      const projectId = required(options, "project");
      const project = await jsonRequest(fetchImpl, baseUrl, `/api/v1/projects/${projectId}`) as { revision: number };
      const form = new FormData();
      form.append("projectId", projectId);
      form.append("role", String(options.role || "source-media"));
      form.append("expectedRevision", String(project.revision));
      form.append("media", new Blob([await fs.readFile(fileName)]), path.basename(fileName));
      result = await jsonRequest(fetchImpl, baseUrl, "/api/v1/assets/import", { method: "POST", body: form });
      const imported = result as { asset?: { id?: string; kind?: string }; project?: { revision?: number } };
      if (imported.asset?.kind === "video" && imported.asset.id && Number.isSafeInteger(imported.project?.revision)) {
        const proxy = await jsonRequest(fetchImpl, baseUrl, `/api/v1/assets/${imported.asset.id}/proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, expectedRevision: imported.project!.revision })
        });
        result = { ...(result as object), proxy };
      }
    } else if (command === "render") {
      result = await jsonRequest(fetchImpl, baseUrl, "/api/v1/renders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: required(options, "project"), sequenceId: required(options, "sequence"), preset: required(options, "preset") })
      });
      if (options.wait === true) {
        const timeoutSeconds = Math.min(24 * 60 * 60, Math.max(1, Number(options.timeout || 7200)));
        result = await waitForRender(fetchImpl, baseUrl, (result as { id: string }).id, timeoutSeconds * 1000);
      }
    } else if (command === "status") result = await jsonRequest(fetchImpl, baseUrl, `/api/v1/renders/${required(options, "job")}`);
    else if (command === "retry") result = await jsonRequest(fetchImpl, baseUrl, `/api/v1/renders/${required(options, "job")}/retry`, { method: "POST" });
    else if (command === "cancel") result = await jsonRequest(fetchImpl, baseUrl, `/api/v1/renders/${required(options, "job")}`, { method: "DELETE" });
    else if (command === "qa") result = await jsonRequest(fetchImpl, baseUrl, `/api/v1/renders/${required(options, "job")}/qa`);
    else if (command === "output") result = await download(fetchImpl, baseUrl, `/api/v1/renders/${required(options, "job")}/output`, required(options, "out"));
    else if (command === "provenance") result = await download(fetchImpl, baseUrl, `/api/v1/renders/${required(options, "job")}/provenance`, required(options, "out"));
    else throw new Error(`Unknown command: ${command}`);

    write(parsed.json ? `${JSON.stringify(result)}\n` : `${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(parsed.json ? `${JSON.stringify({ ok: false, error: message })}\n` : `HRC error: ${message}\n`);
    return 1;
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = await runCli(process.argv.slice(2));

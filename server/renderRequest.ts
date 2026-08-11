import type { RenderPreset } from "../shared/project.js";

export const RENDER_PRESETS = ["draft", "review", "delivery", "archive", "webm", "gif", "webp", "png"] as const satisfies readonly RenderPreset[];

export class RequestContractError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "RequestContractError";
  }
}

function managedId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,127}$/.test(value)) {
    throw new RequestContractError(`Invalid ${label}.`);
  }
  return value;
}

export function parseRenderRequest(input: unknown): { projectId: string; sequenceId: string; preset: RenderPreset } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new RequestContractError("Render request must be a JSON object.");
  const body = input as Record<string, unknown>;
  const projectId = managedId(body.projectId, "project id");
  const sequenceId = managedId(body.sequenceId, "sequence id");
  if (typeof body.preset !== "string" || !RENDER_PRESETS.includes(body.preset as RenderPreset)) {
    throw new RequestContractError("Unsupported render preset.");
  }
  return { projectId, sequenceId, preset: body.preset as RenderPreset };
}

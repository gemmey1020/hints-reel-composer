import type { AssetRole, MediaAsset, ReelProject, RenderPreset } from "../../shared/project.ts";

export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
  activeSequenceId: string;
}

export interface RenderJobState {
  id: string;
  projectId: string;
  sequenceId: string;
  preset: RenderPreset;
  stage: "queued" | "compiling" | "rendering" | "qa" | "complete" | "failed" | "cancelled";
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  attempt: number;
  maxAttempts: number;
  retryOf?: string;
  outputUrl?: string;
  outputFileName?: string;
  qaUrl?: string;
  provenanceUrl?: string;
  provenanceFileName?: string;
  error?: string;
  failureKind?: "ENCODE_FAILURE" | "QA_EXTRACTION_FAILURE" | "TECHNICAL_QA_FAILURE" | "INTERRUPTED" | "OPERATION_FAILURE";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error || payload.errors?.join("\n") || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => requestJson<Record<string, string | boolean>>("/api/v1/health"),
  listProjects: () => requestJson<ProjectSummary[]>("/api/v1/projects"),
  createProject: (title: string) => requestJson<ReelProject>("/api/v1/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  }),
  getProject: (projectId: string) => requestJson<ReelProject>(`/api/v1/projects/${projectId}`),
  saveProject: (project: ReelProject) => requestJson<ReelProject>(`/api/v1/projects/${project.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project)
  }),
  importRecipe: (projectId: string, project: ReelProject) => requestJson<ReelProject>(`/api/v1/projects/${projectId}/import-recipe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project)
  }),
  importMedia: async (projectId: string, file: File, role: AssetRole = "source-media", expectedRevision?: number): Promise<{ asset: MediaAsset; project: ReelProject }> => {
    const form = new FormData();
    form.append("projectId", projectId);
    form.append("role", role);
    if (expectedRevision !== undefined) form.append("expectedRevision", String(expectedRevision));
    form.append("media", file);
    return requestJson("/api/v1/assets/import", { method: "POST", body: form });
  },
  createProxy: (projectId: string, assetId: string, expectedRevision?: number) => requestJson<{ proxyUrl: string; proxySourceHash: string; project: ReelProject }>(`/api/v1/assets/${assetId}/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, expectedRevision })
  }),
  createRender: (projectId: string, sequenceId: string, preset: RenderPreset) => requestJson<RenderJobState>("/api/v1/renders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, sequenceId, preset })
  }),
  cancelRender: (jobId: string) => requestJson<{ cancelled: boolean }>(`/api/v1/renders/${jobId}`, { method: "DELETE" })
};

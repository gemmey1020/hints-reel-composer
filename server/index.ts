import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { validateProject, type RenderPreset } from "../shared/project.js";
import { createProxy, importUploadedMedia, streamAsset } from "./media.js";
import { BRAND_FONT_ROOT, BRAND_LOGO_ROOT, COMPOSER_ROOT, UPLOAD_ROOT, assertSafeId, ensureRuntimeRoots, projectFile } from "./paths.js";
import { createProject, importRecipe, listProjects, readProject, writeProject } from "./projectStore.js";
import { RenderJobManager } from "./renderJobs.js";

const execFileAsync = promisify(execFile);
await ensureRuntimeRoots();

const app = express();
const renderJobs = new RenderJobManager();
const configuredUploadLimit = Number(process.env.HRC_MAX_IMPORT_BYTES || 8 * 1024 * 1024 * 1024);
const maximumUploadBytes = Number.isFinite(configuredUploadLimit) && configuredUploadLimit > 0 ? configuredUploadLimit : 8 * 1024 * 1024 * 1024;
const upload = multer({ dest: UPLOAD_ROOT, limits: { fileSize: maximumUploadBytes, files: 1 } });
const port = Number(process.env.PORT || 8090);
const host = "127.0.0.1";

app.disable("x-powered-by");
app.use((request, response, next) => {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.use(express.json({ limit: process.env.HRC_JSON_LIMIT || "25mb" }));
app.use("/brand-assets/fonts", express.static(BRAND_FONT_ROOT, { immutable: true, maxAge: "1d" }));
app.use("/brand-assets/logo", express.static(BRAND_LOGO_ROOT, { immutable: true, maxAge: "1d" }));
app.get("/favicon.ico", (_request, response) => response.status(204).end());

app.get("/api/v1/health", async (_request, response) => {
  const version = async (tool: string) => {
    try {
      const versionFlag = tool === "blender" || tool === "inkscape" ? "--version" : "-version";
      const { stdout, stderr } = await execFileAsync(tool, [versionFlag], { maxBuffer: 1024 * 1024, timeout: 5000 });
      return (stdout || stderr).split("\n")[0];
    } catch {
      return "unavailable";
    }
  };
  const [ffmpeg, ffprobe, blender, magick, inkscape] = await Promise.all([
    version("ffmpeg"), version("ffprobe"), version("blender"), version("magick"), version("inkscape")
  ]);
  response.json({ ok: true, app: "Hints Reel Composer", ffmpeg, ffprobe, blender, magick, inkscape });
});

app.get("/api/v1/projects", async (_request, response) => response.json(await listProjects()));

app.post("/api/v1/projects", async (request, response) => {
  const project = await createProject(typeof request.body?.title === "string" ? request.body.title : undefined);
  response.status(201).json(project);
});

app.get("/api/v1/projects/:projectId", async (request, response) => {
  response.json(await readProject(assertSafeId(request.params.projectId)));
});

app.put("/api/v1/projects/:projectId", async (request, response) => {
  const projectId = assertSafeId(request.params.projectId);
  if (request.body?.id !== projectId) throw new Error("Project id cannot be changed.");
  response.json(await writeProject(request.body));
});

app.post("/api/v1/projects/:projectId/import-recipe", async (request, response) => {
  const validation = validateProject(request.body);
  if (!validation.valid) return response.status(422).json(validation);
  response.json(await importRecipe(assertSafeId(request.params.projectId), request.body));
});

app.get("/api/v1/projects/:projectId/export-recipe", async (request, response) => {
  const project = await readProject(assertSafeId(request.params.projectId));
  const name = project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "hints-reel";
  response.setHeader("Content-Disposition", `attachment; filename="${name}.hints-reel.json"`);
  response.json(project);
});

app.post("/api/v1/assets/import", upload.single("media"), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: "Media file is required." });
  const projectId = assertSafeId(String(request.body.projectId || ""), "project id");
  const asset = await importUploadedMedia(projectId, request.file.path, request.file.originalname, request.file.mimetype, request.body.role);
  response.status(201).json({ asset, project: await readProject(projectId) });
});

app.post("/api/v1/assets/:assetId/proxy", async (request, response) => {
  const projectId = assertSafeId(String(request.body.projectId || ""), "project id");
  response.json(await createProxy(projectId, assertSafeId(request.params.assetId, "asset id")));
});

app.get("/api/v1/projects/:projectId/assets/:assetId", async (request, response) => {
  await streamAsset(
    assertSafeId(request.params.projectId, "project id"),
    assertSafeId(request.params.assetId, "asset id"),
    request.headers.range,
    response
  );
});

app.get("/api/v1/projects/:projectId/artifacts/:folder/:fileName", async (request, response) => {
  const allowed = new Set(["proxies", "thumbnails", "waveforms", "renders", "qa"]);
  if (!allowed.has(request.params.folder)) return response.status(403).end();
  const projectId = assertSafeId(request.params.projectId, "project id");
  const fileName = path.basename(request.params.fileName);
  const target = projectFile(projectId, request.params.folder, fileName);
  await fs.access(target);
  response.sendFile(target);
});

app.post("/api/v1/renders", async (request, response) => {
  const projectId = assertSafeId(String(request.body.projectId || ""), "project id");
  const sequenceId = assertSafeId(String(request.body.sequenceId || ""), "sequence id");
  const allowedPresets = new Set<RenderPreset>(["draft", "review", "delivery", "archive", "webm", "gif", "webp", "png"]);
  const preset = request.body.preset as RenderPreset;
  if (!allowedPresets.has(preset)) return response.status(400).json({ error: "Unsupported render preset." });
  response.status(202).json(await renderJobs.create(projectId, sequenceId, preset));
});

app.get("/api/v1/renders/:jobId/events", (request, response) => {
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  const unsubscribe = renderJobs.subscribe(assertSafeId(request.params.jobId, "render job id"), (job) => {
    response.write(`data: ${JSON.stringify(job)}\n\n`);
    if (["complete", "failed", "cancelled"].includes(job.stage)) response.end();
  });
  if (!unsubscribe) return response.status(404).end();
  request.on("close", unsubscribe);
});

app.delete("/api/v1/renders/:jobId", (request, response) => {
  const cancelled = renderJobs.cancel(assertSafeId(request.params.jobId, "render job id"));
  response.status(cancelled ? 202 : 404).json({ cancelled });
});

app.post("/api/v1/renders/:jobId/qa", (request, response) => {
  const job = renderJobs.get(assertSafeId(request.params.jobId, "render job id"));
  if (!job) return response.status(404).json({ error: "Render job not found." });
  response.json({ job, qaPath: job.stage === "complete" ? `qa/${job.id}` : null });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(COMPOSER_ROOT, "dist")));
  app.get("/{*path}", (_request, response) => response.sendFile(path.join(COMPOSER_ROOT, "dist", "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ root: COMPOSER_ROOT, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  const candidateStatus = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus < 500 ? candidateStatus : 500;
  if (!response.headersSent) response.status(status).json({ error: status === 500 ? "Internal Composer error." : message });
});

app.listen(port, host, () => {
  console.log(`Hints Reel Composer running at http://${host}:${port}`);
});

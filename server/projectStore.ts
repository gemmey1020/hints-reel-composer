import fs from "node:fs/promises";
import path from "node:path";
import { createDefaultProject, type ReelProject, validateProject } from "../shared/project.js";
import { PROJECTS_ROOT, projectDir, projectFile } from "./paths.js";

const PROJECT_FOLDERS = ["media", "proxies", "thumbnails", "waveforms", "autosaves", "renders", "qa", "logs"];

async function ensureProjectFolders(projectId: string): Promise<void> {
  const root = projectDir(projectId);
  await fs.mkdir(root, { recursive: true });
  await Promise.all(PROJECT_FOLDERS.map((folder) => fs.mkdir(path.join(root, folder), { recursive: true })));
}

export async function listProjects(): Promise<Array<Pick<ReelProject, "id" | "title" | "updatedAt" | "activeSequenceId">>> {
  const entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
  const projects = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".hintsreel"))
    .map(async (entry) => {
      try {
        const raw = await fs.readFile(path.join(PROJECTS_ROOT, entry.name, "project.json"), "utf8");
        const project = JSON.parse(raw) as ReelProject;
        return { id: project.id, title: project.title, updatedAt: project.updatedAt, activeSequenceId: project.activeSequenceId };
      } catch {
        return null;
      }
    }));
  return projects.filter((project): project is NonNullable<typeof project> => Boolean(project))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createProject(title?: string): Promise<ReelProject> {
  const project = createDefaultProject(title?.trim() || "Untitled Reel");
  await ensureProjectFolders(project.id);
  await writeProject(project, false);
  return project;
}

export async function readProject(projectId: string): Promise<ReelProject> {
  const raw = await fs.readFile(projectFile(projectId, "project.json"), "utf8");
  const project = JSON.parse(raw) as ReelProject;
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(`Invalid project: ${validation.errors.join(" ")}`);
  return project;
}

export async function writeProject(project: ReelProject, autosave = true): Promise<ReelProject> {
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  await ensureProjectFolders(project.id);
  const destination = projectFile(project.id, "project.json");
  if (autosave) {
    try {
      const previous = await fs.readFile(destination, "utf8");
      const autosaveName = `project-${Date.now()}.json`;
      await fs.writeFile(projectFile(project.id, "autosaves", autosaveName), previous, "utf8");
      const autosaves = (await fs.readdir(projectFile(project.id, "autosaves"))).sort().reverse();
      await Promise.all(autosaves.slice(12).map((file) => fs.unlink(projectFile(project.id, "autosaves", file))));
    } catch {
      // The first save has no prior snapshot.
    }
  }
  const next = { ...project, updatedAt: new Date().toISOString() };
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(temporary, destination);
  return next;
}

export async function importRecipe(projectId: string, incoming: unknown): Promise<ReelProject> {
  const validation = validateProject(incoming);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  const current = await readProject(projectId);
  const recipe = incoming as ReelProject;
  const imported: ReelProject = {
    ...recipe,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    assets: recipe.assets.map((asset) => ({ ...asset }))
  };
  return writeProject(imported);
}

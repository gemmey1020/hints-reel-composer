import type { ReelProject } from "../../shared/project.ts";

type ProjectWriter = (project: ReelProject) => Promise<ReelProject>;

export class ProjectPersistenceQueue {
  private tail: Promise<void> = Promise.resolve();
  private serverRevision: number;

  constructor(initialRevision: number, private readonly writer: ProjectWriter) {
    this.serverRevision = initialRevision;
  }

  get revision(): number {
    return this.serverRevision;
  }

  adoptRevision(revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid project revision.");
    this.serverRevision = revision;
  }

  save(project: ReelProject): Promise<ReelProject> {
    return this.mutate((revision) => this.writer({ ...project, revision }));
  }

  mutate(operation: (revision: number) => Promise<ReelProject>): Promise<ReelProject> {
    const result = this.tail.catch(() => undefined).then(async () => {
      const saved = await operation(this.serverRevision);
      if (!Number.isSafeInteger(saved.revision) || saved.revision < this.serverRevision) {
        throw new Error("Server returned a stale project revision.");
      }
      this.serverRevision = saved.revision;
      return saved;
    });
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

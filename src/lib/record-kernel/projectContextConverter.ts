/**
 * Project → Context converter · the first transition adapter (architecture
 * doc §12/§18): existing projects become kernel contexts of type "project"
 * with a deterministic id, so re-running the conversion is idempotent and
 * the legacy project store stays untouched (dual-run, rollback = keep using
 * it).
 *
 * Deliberately takes a minimal structural shape instead of the legacy
 * `Project` domain type: the kernel must not import the session-centric
 * domain (the no-leak rule), and callers at the boundary can pass any
 * project-like object.
 */
import type { KernelContext } from "./kernelTypes";

export type ProjectLike = {
  id: string;
  name: string;
};

export function projectContextId(projectId: string): string {
  return `ctx-project-${projectId}`;
}

export function projectToContext(
  project: ProjectLike,
  now: () => Date = () => new Date(),
): KernelContext {
  return {
    id: projectContextId(project.id),
    type: "project",
    name: project.name,
    createdAt: now().toISOString(),
  };
}

/** Converts a batch, skipping projects already present in `existing` so the
 *  converter never clobbers a context the user may have edited. */
export function convertMissingProjectContexts(
  projects: ProjectLike[],
  existing: KernelContext[],
  now: () => Date = () => new Date(),
): KernelContext[] {
  const existingIds = new Set(existing.map((context) => context.id));
  return projects
    .filter((project) => !existingIds.has(projectContextId(project.id)))
    .map((project) => projectToContext(project, now));
}

import type { UserProject } from "../../lib/projects/userProjects";

/** The project a first session is filed under when the user has none yet. */
export const FIRST_PROJECT = "내 작업";

/**
 * The projects a new session can be filed under: the user's projects, then the
 * labels of their own stored sessions. With none of either, a single default,
 * so the first session can be created without stopping to make a project.
 */
export function projectChoices(
  userProjects: Pick<UserProject, "key">[],
  storedSessions: { sourceLabel?: string | null }[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value: string | null | undefined) => {
    const key = (value ?? "").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  for (const project of userProjects) add(project.key);
  for (const summary of storedSessions) add(summary.sourceLabel);
  return out.length > 0 ? out : [FIRST_PROJECT];
}

/**
 * A calendar day's agent sessions, readable: grouped under the project the
 * operator filed each one in (reviewed membership); a session with none is
 * grouped by the folder it ran in, labelled as a folder (an observation, as on
 * the 세션 page, never a project); else "프로젝트 없음". Reviewed projects come
 * first, then folders, busiest first; sessions in time order.
 */
import type { KernelContext, MoriRecord } from "../../lib/record-kernel/kernelTypes";

export type DaySessionGroup = {
  /** `project:<contextId>`, `folder:<name>`, or "" for neither. */
  key: string;
  kind: "project" | "folder" | "none";
  label: string;
  sessions: MoriRecord[];
};

export const NO_PROJECT_LABEL = "프로젝트 없음";

export function groupDaySessions(
  sessions: readonly MoriRecord[],
  contexts: readonly KernelContext[],
  folderOf: (sessionId: string) => string | null = () => null,
): DaySessionGroup[] {
  const live = new Map(contexts.filter((context) => !context.archived).map((context) => [context.id, context]));
  const groups = new Map<string, DaySessionGroup>();
  for (const session of sessions) {
    const contextId = (session.contextIds ?? []).find((id) => live.has(id));
    const folder = contextId ? null : folderOf(session.id);
    const group: Omit<DaySessionGroup, "sessions"> = contextId
      ? { key: `project:${contextId}`, kind: "project", label: live.get(contextId)!.name }
      : folder
        ? { key: `folder:${folder}`, kind: "folder", label: folder }
        : { key: "", kind: "none", label: NO_PROJECT_LABEL };
    const held = groups.get(group.key) ?? { ...group, sessions: [] };
    held.sessions.push(session);
    groups.set(group.key, held);
  }
  for (const group of groups.values()) {
    group.sessions.sort((a, b) => (a.occurredStart ?? a.capturedAt).localeCompare(b.occurredStart ?? b.capturedAt));
  }
  const rank = { project: 0, folder: 1, none: 2 } as const;
  return [...groups.values()].sort(
    (a, b) => rank[a.kind] - rank[b.kind] || b.sessions.length - a.sessions.length || a.label.localeCompare(b.label),
  );
}

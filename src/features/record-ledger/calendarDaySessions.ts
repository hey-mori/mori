/**
 * A calendar day's agent sessions, readable: grouped under the project the
 * operator filed each one in (reviewed membership); a session with none is
 * grouped by the folder it ran in, labelled as a folder (an observation, as on
 * the 세션 page, never a project); else "프로젝트 없음". Membership is read
 * through `membershipState`, the one authority: a session whose reviewed
 * project is missing or archived is grouped as "프로젝트 확인 필요", never
 * quietly re-filed. Reviewed projects first, then that, then folders, busiest
 * first; sessions newest first, like the rest of the day.
 */
import type { KernelContext, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { membershipState } from "../../lib/record-kernel/projectMembership";

export type DaySessionGroup = {
  /** `project:<contextId>`, `folder:<name>`, or "" for neither. */
  key: string;
  kind: "project" | "invalid" | "folder" | "none";
  label: string;
  sessions: MoriRecord[];
};

export const NO_PROJECT_LABEL = "프로젝트 없음";
export const INVALID_PROJECT_LABEL = "프로젝트 확인 필요";

export function groupDaySessions(
  sessions: readonly MoriRecord[],
  contexts: readonly KernelContext[],
  folderOf: (sessionId: string) => string | null = () => null,
): DaySessionGroup[] {
  const groups = new Map<string, DaySessionGroup>();
  for (const session of sessions) {
    const membership = membershipState(session, contexts);
    const folder = membership.kind === "none" ? folderOf(session.id) : null;
    const group: Omit<DaySessionGroup, "sessions"> =
      membership.kind === "member"
        ? { key: `project:${membership.context.id}`, kind: "project", label: membership.context.name }
        : membership.kind === "invalid"
          ? { key: "invalid", kind: "invalid", label: INVALID_PROJECT_LABEL }
          : folder
            ? { key: `folder:${folder}`, kind: "folder", label: folder }
            : { key: "", kind: "none", label: NO_PROJECT_LABEL };
    const held = groups.get(group.key) ?? { ...group, sessions: [] };
    held.sessions.push(session);
    groups.set(group.key, held);
  }
  for (const group of groups.values()) {
    group.sessions.sort((a, b) => sessionTime(b).localeCompare(sessionTime(a)));
  }
  const rank = { project: 0, invalid: 1, folder: 2, none: 3 } as const;
  return [...groups.values()].sort(
    (a, b) => rank[a.kind] - rank[b.kind] || b.sessions.length - a.sessions.length || a.label.localeCompare(b.label),
  );
}

/** When a session happened, for ordering: its activity start, else capture. */
export function sessionTime(session: Pick<MoriRecord, "occurredStart" | "capturedAt">): string {
  return session.occurredStart ?? session.capturedAt;
}

/** The way-back label for a session opened from a calendar day, e.g.
 *  "캘린더 10월 10일", with the year when it is not this year. Read from the
 *  YYYY-MM-DD key itself, so no time zone can move it to a neighbouring day. */
export function calendarDayLabel(date: string, now: Date): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "캘린더";
  const year = Number(match[1]) === now.getFullYear() ? "" : `${match[1]}년 `;
  return `캘린더 ${year}${Number(match[2])}월 ${Number(match[3])}일`;
}

import type { SessionMode, SessionViewModel } from "../../app/sessionStore";
import type { Session } from "../../domain/types";
import type { ProductStateTone } from "../product-state/productStateLabels";
import type { StoredSessionSummary } from "../storage/storageTypes";

/**
 * Workspace & Projects model.
 *
 * Mori is single-project-local today: one project holds every session
 * the user records on this device. This module turns the active
 * session view plus the locally stored session drafts into a calm
 * project overview — it never invents projects or sessions, and the
 * "multiple projects" capability stays planned until a project model
 * with its own store exists.
 */

export type WorkspaceSessionEntry = {
  sessionId: string;
  title: string;
  status: Session["status"];
  /** ISO timestamp the draft was last saved; `null` for an unsaved session. */
  savedAt: string | null;
  isActive: boolean;
};

export type WorkspaceSummary = {
  projectId: string;
  projectName: string;
  projectDescription: string;
  createdAt: string;
  updatedAt: string;
  /** True while the active session is the bundled demo, not a real draft. */
  isDemoProject: boolean;
  activeSessionId: string;
  sessionCount: number;
  sessions: WorkspaceSessionEntry[];
  counts: {
    events: number;
    issues: number;
    decisions: number;
  };
};

export type WorkspaceSummaryInput = {
  view: SessionViewModel;
  mode: SessionMode;
  storedSessions: StoredSessionSummary[];
};

/**
 * Build the workspace overview from the active session view and the
 * locally persisted session drafts. Sessions are scoped to the active
 * project so a future multi-project store stays correct without a
 * rewrite; the active session is always present even before its draft
 * has been saved.
 */
export function buildWorkspaceSummary({
  view,
  mode,
  storedSessions,
}: WorkspaceSummaryInput): WorkspaceSummary {
  const { project, session } = view;
  const activeSessionId = session.id;

  const entries: WorkspaceSessionEntry[] = storedSessions
    .filter((entry) => entry.projectId === project.id)
    .map((entry) => ({
      sessionId: entry.sessionId,
      title: entry.title,
      status: entry.status,
      savedAt: entry.savedAt,
      isActive: entry.sessionId === activeSessionId,
    }));

  if (!entries.some((entry) => entry.isActive)) {
    entries.push({
      sessionId: activeSessionId,
      title: session.title,
      status: session.status,
      savedAt: null,
      isActive: true,
    });
  }

  entries.sort(compareWorkspaceSessions);

  return {
    projectId: project.id,
    projectName: project.name,
    projectDescription: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    isDemoProject: mode === "demo",
    activeSessionId,
    sessionCount: entries.length,
    sessions: entries,
    counts: {
      events: view.events.length,
      issues: view.issues.length,
      decisions: view.decisions.length,
    },
  };
}

/**
 * Order sessions for display: the active session first, then the most
 * recently saved drafts. An unsaved session sorts ahead of saved ones
 * because it represents the freshest work on the device.
 */
function compareWorkspaceSessions(
  a: WorkspaceSessionEntry,
  b: WorkspaceSessionEntry,
): number {
  if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
  if (a.savedAt === null && b.savedAt === null) return 0;
  if (a.savedAt === null) return -1;
  if (b.savedAt === null) return 1;
  return b.savedAt.localeCompare(a.savedAt);
}

const SESSION_STATUS_LABEL: Record<Session["status"], string> = {
  recording: "기록 중",
  analyzing: "분석 중",
  complete: "완료",
};

const SESSION_STATUS_TONE: Record<Session["status"], ProductStateTone> = {
  recording: "accent",
  analyzing: "info",
  complete: "success",
};

export function describeWorkspaceSessionStatus(status: Session["status"]): {
  label: string;
  tone: ProductStateTone;
} {
  return {
    label: SESSION_STATUS_LABEL[status],
    tone: SESSION_STATUS_TONE[status],
  };
}

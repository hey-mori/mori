/**
 * Auto-import · pure core.
 *
 * Continuous auto-import turns every discovered agent session (Claude, Codex,
 * OpenCode, …) into a lightweight `StoredSessionDraft` so it appears in the 세션
 * workspace's 과거 list WITHOUT the user importing it by hand — and keeps it in
 * sync as the session grows. This module is the pure, side-effect-free core:
 * the stable identity, the discovery→draft mapping, and the change diff. The
 * React hook and the persistence live elsewhere; everything here is testable in
 * isolation.
 *
 * Doctrine: this REGISTERS a session (makes it visible + openable), it does not
 * APPLY anything to durable memory. The review gate still governs the deeper
 * analyze→apply step. Scope stays the connected agents' own logs; transparency
 * is a notification per sync; a registration is reversible (the row can be
 * removed). See project memory: the three rails (scope · review-gate ·
 * transparency).
 */
import type { AgentWorkSessionMeta } from "./workSessions";
import type { StoredSessionDraft, StoredSessionSummary } from "../storage/storageTypes";
import type { Project, Session } from "../../domain/types";

/** localStorage key holding the reopen descriptors for auto-registered sessions
 *  (sessionId → the discovery meta), so a click can load the real body. */
export const AUTO_IMPORT_META_KEY = "mori.autoImport.v1";

/** Prefix that marks a session id as auto-registered (vs a manual import). */
const AUTO_ID_PREFIX = "auto-";

/**
 * Two independent FNV-1a passes over the input → a ~64-bit key-safe suffix.
 * The discovery `meta.id` is already globally unique; this only shortens it to
 * a stable localStorage-key-safe token, wide enough that distinct ids do not
 * collide within an agent in practice.
 */
function stableHash(input: string): string {
  let a = 2166136261;
  let b = 2246822519;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 16777619) + a;
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}

/**
 * The stable Mori session id for a discovered agent session. Derived from the
 * discovery meta's own globally-unique composite id, so re-discovering the same
 * conversation maps to the SAME id — the upsert overwrites in place instead of
 * duplicating a row every poll.
 */
export function autoImportedSessionId(meta: Pick<AgentWorkSessionMeta, "id" | "agentId">): string {
  return `${AUTO_ID_PREFIX}${meta.agentId}-${stableHash(meta.id)}`;
}

/** Whether a stored session id was created by auto-import. */
export function isAutoImportedSessionId(sessionId: string): boolean {
  return sessionId.startsWith(AUTO_ID_PREFIX);
}

/** Stable project id for a discovered session, grouped by its project path so
 *  the 과거 project grouping stays consistent across polls. */
export function autoImportedProjectId(
  meta: Pick<AgentWorkSessionMeta, "projectPath" | "projectName" | "agentId">,
): string {
  const key = (meta.projectPath || meta.projectName || meta.agentId).trim();
  return `${AUTO_ID_PREFIX}proj-${stableHash(key)}`;
}

/**
 * Codex (and future agents) emit placeholder metas for files that were too
 * large or failed to parse, titled with a ⚠ reason string. These are not real
 * sessions — never register them.
 */
export function isUnreadableAgentSession(meta: Pick<AgentWorkSessionMeta, "title">): boolean {
  return meta.title.trim().startsWith("⚠");
}

/**
 * Map a discovered agent session's META into a metadata-only StoredSessionDraft.
 * No body is loaded — `savedAt` is pinned to the session's own last-activity
 * time (not "now"), so a re-seen session does not jump to the top of the 과거
 * list on every poll. The full transcript loads on click.
 */
export function agentSessionToStoredDraft(meta: AgentWorkSessionMeta): StoredSessionDraft {
  const sessionId = autoImportedSessionId(meta);
  const projectId = autoImportedProjectId(meta);
  const startedAt = meta.startedAt || meta.updatedAt || "";
  const endedAt = meta.updatedAt || meta.startedAt || startedAt;
  const projectName = (meta.projectName || meta.agentName || "").trim() || "세션";

  const project: Project = {
    id: projectId,
    name: projectName,
    description: "",
    createdAt: startedAt,
    updatedAt: endedAt,
  };
  const session: Session = {
    id: sessionId,
    projectId,
    title: meta.title.trim() || "제목 없음",
    startedAt,
    endedAt,
    recordingMode: "summary",
    llmProvider: "deterministic",
    llmModel: "",
    storageLocation: "auto-import",
    selectedSourceIds: [],
    status: "complete",
    // Drives the 과거 project-group header + the source chip in the row.
    sourceLabel: meta.projectPath || meta.projectName || undefined,
  };
  return {
    project,
    session,
    // Pin to the session's activity time so ordering is stable across polls.
    savedAt: endedAt || startedAt || meta.startedAt,
    adapter: "browser-local-storage",
  };
}

/** A cheap change fingerprint for a discovered session — its last-activity time
 *  plus message count. Either changing means the session grew. */
export function agentSessionFingerprint(
  meta: Pick<AgentWorkSessionMeta, "updatedAt" | "startedAt" | "messageCount">,
): string {
  const stamp = meta.updatedAt || meta.startedAt || "";
  return `${stamp}|${meta.messageCount}`;
}

export type AutoImportDiff = {
  /** Discovered sessions that are new or changed since last sync — to upsert. */
  toUpsert: AgentWorkSessionMeta[];
  /** How many are brand new (not previously registered). */
  newCount: number;
  /** How many are previously registered but changed. */
  updatedCount: number;
};

/**
 * Diff the freshly-discovered sessions against what we have already registered.
 * `seen` maps an auto session id → its last-registered fingerprint. A session
 * absent from `seen` is new; one present with a different fingerprint changed;
 * an identical fingerprint is skipped (no churn). Unreadable placeholders and
 * within-batch duplicates are dropped.
 */
export function diffDiscoveredSessions(
  discovered: readonly AgentWorkSessionMeta[],
  seen: ReadonlyMap<string, string>,
): AutoImportDiff {
  const toUpsert: AgentWorkSessionMeta[] = [];
  const handled = new Set<string>();
  let newCount = 0;
  let updatedCount = 0;

  for (const meta of discovered) {
    if (isUnreadableAgentSession(meta)) continue;
    const id = autoImportedSessionId(meta);
    if (handled.has(id)) continue;
    handled.add(id);

    const fingerprint = agentSessionFingerprint(meta);
    const previous = seen.get(id);
    if (previous === undefined) {
      newCount += 1;
      toUpsert.push(meta);
    } else if (previous !== fingerprint) {
      updatedCount += 1;
      toUpsert.push(meta);
    }
  }

  return { toUpsert, newCount, updatedCount };
}

/**
 * Rebuild the `seen` fingerprint map from the reopen-descriptor metas we
 * persisted, so a fresh app launch does not re-flag every already-registered
 * session as new. Keyed by auto session id.
 */
export function seenFingerprintsFromMetas(
  metas: readonly AgentWorkSessionMeta[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const meta of metas) {
    map.set(autoImportedSessionId(meta), agentSessionFingerprint(meta));
  }
  return map;
}

/** The stored summaries that were created by auto-import (for reconciliation). */
export function autoImportedSummaries(
  summaries: readonly StoredSessionSummary[],
): StoredSessionSummary[] {
  return summaries.filter((summary) => isAutoImportedSessionId(summary.sessionId));
}

/**
 * The T2 project projection · what is happening in one project, folded from the
 * intake buffer's rows.
 *
 * This is the object that makes an overview "continuously updated" instead of
 * recomputed from saved session metadata. It is a pure derivation: give it the
 * rows and a clock, get one entry per project.
 *
 * Two rules from the execution plan shape everything here.
 *
 * **D11 · an observation is a claim about the moment it was made.** Mori only
 * watches while it is open, so a row saying `running` proves the request was
 * mid-turn *then*. Past the live window this projection stops reporting present
 * tense at all rather than letting a surface imply Mori is watching something it
 * is not. A stale `running` becomes `unknown`, never `completed`: Mori did not
 * see it end, and inventing an ending is the same failure as inventing a
 * present.
 *
 * **D12 · current effort counts, accumulated effort does not.** Each running
 * request carries its elapsed time and step count, because "71스텝째, 30분째"
 * says whether the work is going well or is stuck. Sums over time are a
 * different surface's job and are not folded here.
 */
import type { IntakeRequestRow } from "./intakeTypes";
import type { SessionActivityStatus } from "../../features/live-session/liveFeed";

/**
 * How current the newest observation backing a projection is.
 *
 * `live` matches the feed's own stall threshold, the same 5 minutes it uses to
 * decide a session is still working, so the two layers cannot disagree about
 * what "now" means.
 */
export type ProjectFreshness = "live" | "recent" | "stale";

const LIVE_MS = 5 * 60_000;
const RECENT_MS = 6 * 60 * 60_000;

/** A request still in flight, with what tells the user whether it is healthy. */
export type ProjectRunningRequest = {
  id: string;
  title: string;
  sessionLabel: string;
  /** The session file the request belongs to, to open its conversation. */
  sessionKey: string;
  startedAt: string;
  /** Wall time since the request opened. */
  elapsedMs: number;
  stepCount: number;
};

export type ProjectRecentRequest = {
  id: string;
  title: string;
  sessionLabel: string;
  sessionKey: string;
  status: SessionActivityStatus;
  endedAt: string;
};

export type ProjectTouchedFile = {
  path: string;
  additions: number;
  deletions: number;
};

export type ProjectProjection = {
  projectPath: string;
  /** Trailing segment, for display only. Never the fold key (see D8 / S1). */
  label: string;
  /** Newest observation across contributing rows. */
  observedAt: string;
  freshness: ProjectFreshness;
  /**
   * The oldest observation behind a present-tense count, or null when nothing
   * is counted. The header dates the counts by this, not by the newest row, so
   * one session seen a minute ago cannot make a count from hours ago read live.
   */
  countedObservedAt: string | null;
  /** Present-tense counts. All zero once `freshness` is `stale`, by D11. */
  runningCount: number;
  waitingCount: number;
  /** Requests whose agent finished its turn and waits for the user, newest
   *  first. Present tense, so empty once the observation is stale. */
  waiting: ProjectRecentRequest[];
  blockedCount: number;
  /** Requests the agent stopped on, newest first; empty once stale. */
  blocked: ProjectRecentRequest[];
  /** Detail for each in-flight request; empty unless `freshness` is not stale. */
  running: ProjectRunningRequest[];
  recentRequests: ProjectRecentRequest[];
  topFiles: ProjectTouchedFile[];
  /** Newest request end across the project, present even when stale. */
  lastActivityAt: string | null;
  /** Rows folded in, so a caller can tell an empty projection from a thin one. */
  rowCount: number;
  /**
   * Sessions whose source was written after Mori last observed them, newest
   * activity first. Their observed status is history: none of it is counted.
   */
  continued: ProjectContinuedSession[];
};

/** A session that kept going after Mori's last look at it. */
export type ProjectContinuedSession = {
  sessionKey: string;
  /** The newest observed request's title and status, as last seen. */
  lastTitle: string;
  lastStatus: SessionActivityStatus;
  lastObservedAt: string;
  /** When its source was last written. */
  activeAt: string;
};

/**
 * How much later than the last observation a source write must be before the
 * observation counts as superseded. Covers the poller's cadence (at most a few
 * tens of seconds) so a session Mori is watching is never marked as moved on.
 */
const SUPERSEDE_GRACE_MS = 2 * 60_000;

export type BuildProjectProjectionOptions = {
  now: number;
  /**
   * When a session's source was last written, as discovery last saw it (an
   * auto-imported session's `savedAt`). Lets the fold tell an observation the
   * session has since moved past from one that may still hold.
   */
  sourceActiveAt?: (sessionKey: string) => string | undefined;
  recentRequestLimit?: number;
  topFileLimit?: number;
};

const DEFAULT_RECENT_REQUESTS = 6;
const DEFAULT_TOP_FILES = 5;

/**
 * Fold intake rows into one projection per project, newest activity first.
 *
 * Rows with no resolved project path are dropped rather than bucketed under a
 * placeholder: S1 leaves the path empty precisely when the reader could not
 * attribute the session, and inventing a project for it would be the same class
 * of error as folding on a basename.
 */
export function buildProjectProjections(
  rows: readonly IntakeRequestRow[],
  opts: BuildProjectProjectionOptions,
): ProjectProjection[] {
  const recentLimit = Math.max(1, opts.recentRequestLimit ?? DEFAULT_RECENT_REQUESTS);
  const fileLimit = Math.max(1, opts.topFileLimit ?? DEFAULT_TOP_FILES);

  const byProject = new Map<string, IntakeRequestRow[]>();
  for (const row of rows) {
    const key = row.projectPath?.trim();
    if (!key) continue;
    const held = byProject.get(key);
    if (held) held.push(row);
    else byProject.set(key, [row]);
  }

  const projections: ProjectProjection[] = [];
  for (const [projectPath, projectRows] of byProject) {
    projections.push(
      foldProject(projectPath, projectRows, opts.now, recentLimit, fileLimit, labelOf(projectPath), opts.sourceActiveAt),
    );
  }

  projections.sort((a, b) => epoch(b.lastActivityAt) - epoch(a.lastActivityAt));
  return projections;
}

function foldProject(
  projectPath: string,
  rows: readonly IntakeRequestRow[],
  now: number,
  recentLimit: number,
  fileLimit: number,
  label: string = labelOf(projectPath),
  sourceActiveAt?: (sessionKey: string) => string | undefined,
): ProjectProjection {
  const observedAt = rows.reduce(
    (newest, row) => (epoch(row.observedAt) > epoch(newest) ? row.observedAt : newest),
    rows[0]?.observedAt ?? "",
  );
  const freshness = freshnessOf(observedAt, now);

  // Past the live window nothing may be reported in the present tense. Each
  // row is judged by its OWN observation: a session observed a minute ago must
  // not make another session's request, last seen hours ago, read as current.
  // (The projection's newest observation used to stand in for every row.)
  //
  // An observation also stops holding once its session's source was written
  // after it: Mori was not looking, the session went on, and whatever it was
  // then is not evidence of what it is now. Only the source's own last write
  // decides this, never the time Mori read it.
  const newestRowBySession = new Map<string, IntakeRequestRow>();
  for (const row of rows) {
    const held = newestRowBySession.get(row.sessionKey);
    if (!held || epoch(row.observedAt) > epoch(held.observedAt) || (row.observedAt === held.observedAt && epoch(row.endedAt) > epoch(held.endedAt))) {
      newestRowBySession.set(row.sessionKey, row);
    }
  }
  const continued: ProjectContinuedSession[] = [];
  for (const [sessionKey, newest] of newestRowBySession) {
    const activeAt = sourceActiveAt?.(sessionKey);
    if (!activeAt || !(epoch(activeAt) > epoch(newest.observedAt) + SUPERSEDE_GRACE_MS)) continue;
    continued.push({
      sessionKey,
      lastTitle: newest.title,
      lastStatus: newest.status,
      lastObservedAt: newest.observedAt,
      activeAt,
    });
  }
  continued.sort((a, b) => epoch(b.activeAt) - epoch(a.activeAt));
  const superseded = new Set(continued.map((session) => session.sessionKey));
  const rowIsCurrent = (row: IntakeRequestRow) =>
    !superseded.has(row.sessionKey) && freshnessOf(row.observedAt, now) !== "stale";

  let runningCount = 0;
  let waitingCount = 0;
  let blockedCount = 0;
  const running: ProjectRunningRequest[] = [];
  const waiting: ProjectRecentRequest[] = [];
  const blocked: ProjectRecentRequest[] = [];
  let countedObservedAt: string | null = null;

  {
    for (const row of rows) {
      if (!rowIsCurrent(row)) continue;
      if (row.status === "running" || row.status === "waitingForUser" || row.status === "blocked") {
        if (countedObservedAt === null || epoch(row.observedAt) < epoch(countedObservedAt)) countedObservedAt = row.observedAt;
      }
      if (row.status === "running") {
        runningCount += 1;
        running.push({
          id: row.id,
          title: row.title,
          sessionLabel: row.sessionLabel,
          sessionKey: row.sessionKey,
          startedAt: row.startedAt,
          // Elapsed up to the last time it was seen running, unless that was
          // moments ago: a request seen hours ago is not known to run since.
          elapsedMs: Math.max(
            0,
            (freshnessOf(row.observedAt, now) === "live" ? now : epoch(row.observedAt)) - epoch(row.startedAt),
          ),
          stepCount: row.stepCount,
        });
      } else if (row.status === "waitingForUser") {
        waitingCount += 1;
        waiting.push({ id: row.id, title: row.title, sessionLabel: row.sessionLabel, sessionKey: row.sessionKey, status: row.status, endedAt: row.endedAt });
      }
      else if (row.status === "blocked") {
        blockedCount += 1;
        blocked.push({ id: row.id, title: row.title, sessionLabel: row.sessionLabel, sessionKey: row.sessionKey, status: row.status, endedAt: row.endedAt });
      }
    }
    running.sort((a, b) => b.elapsedMs - a.elapsedMs);
    waiting.sort((a, b) => epoch(b.endedAt) - epoch(a.endedAt));
    blocked.sort((a, b) => epoch(b.endedAt) - epoch(a.endedAt));
  }

  const ordered = [...rows].sort((a, b) => epoch(b.endedAt) - epoch(a.endedAt));

  return {
    projectPath,
    label,
    observedAt,
    freshness,
    countedObservedAt,
    runningCount,
    waitingCount,
    waiting,
    blockedCount,
    blocked,
    running,
    recentRequests: ordered.slice(0, recentLimit).map((row) => ({
      id: row.id,
      title: row.title,
      sessionLabel: row.sessionLabel,
      sessionKey: row.sessionKey,
      // A past request's own status is a past fact and does not decay; only the
      // present-tense reading of a live row does.
      status: rowIsCurrent(row) ? row.status : decay(row.status),
      endedAt: row.endedAt,
    })),
    topFiles: rollUpFiles(rows, fileLimit),
    // A session that went on after the observation was active then, too.
    lastActivityAt: [ordered[0]?.endedAt, ...continued.map((session) => session.activeAt)].reduce<string | null>(
      (latest, at) => (at && (latest === null || epoch(at) > epoch(latest)) ? at : latest),
      null,
    ),
    rowCount: rows.length,
    continued,
  };
}

/**
 * What a status means once Mori has stopped watching. `completed` is a fact
 * about the past and survives; every present-tense status becomes `unknown`,
 * because Mori has no evidence either way and would otherwise be guessing.
 */
function decay(status: SessionActivityStatus): SessionActivityStatus {
  return status === "completed" ? "completed" : "unknown";
}

/**
 * One projection over the rows of a chosen set of sessions, whatever folders
 * they were observed in: a reviewed project's confirmed sessions. Null when
 * there is no row. The label is the project's, not a folder's.
 */
export function buildScopedProjection(
  rows: readonly IntakeRequestRow[],
  opts: BuildProjectProjectionOptions & { label: string },
): ProjectProjection | null {
  if (rows.length === 0) return null;
  const recentLimit = Math.max(1, opts.recentRequestLimit ?? DEFAULT_RECENT_REQUESTS);
  const fileLimit = Math.max(1, opts.topFileLimit ?? DEFAULT_TOP_FILES);
  return foldProject("", rows, opts.now, recentLimit, fileLimit, opts.label, opts.sourceActiveAt);
}

export function freshnessOf(observedAt: string, now: number): ProjectFreshness {
  const age = now - epoch(observedAt);
  if (age <= LIVE_MS) return "live";
  if (age <= RECENT_MS) return "recent";
  return "stale";
}

/** Files by how much this project's observed work changed them. */
function rollUpFiles(rows: readonly IntakeRequestRow[], limit: number): ProjectTouchedFile[] {
  const byPath = new Map<string, ProjectTouchedFile>();
  for (const row of rows) {
    for (const file of row.files) {
      const held = byPath.get(file.path);
      if (held) {
        held.additions += file.additions;
        held.deletions += file.deletions;
      } else {
        byPath.set(file.path, {
          path: file.path,
          additions: file.additions,
          deletions: file.deletions,
        });
      }
    }
  }
  return [...byPath.values()]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, limit);
}

/**
 * Find the projection for a project the UI is showing, by its display leaf.
 *
 * A leaf is all the surface can offer: `ProjectGroup` keys on one, because a
 * saved session knows only a filesystem leaf. So this mirrors the resolution
 * rule `buildProjectGroups` already uses for sessions, including its refusal:
 * when two observed projects share a trailing name (`C:\work\api` and
 * `C:\play\api`), the leaf cannot say which is meant, and returning either would
 * attach one project's live state to another's page. Ambiguity returns null and
 * the section simply does not render.
 */
export function selectProjectionForLabel(
  projections: readonly ProjectProjection[],
  label: string,
): ProjectProjection | null {
  const wanted = label.trim().toLowerCase();
  if (!wanted) return null;
  const matches = projections.filter((p) => p.label.trim().toLowerCase() === wanted);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Resolve a display label to the one project path it can only mean.
 *
 * The same rule as `selectProjectionForLabel`, applied one step earlier: a
 * label is the leaf of a path, so two projects whose folders share a leaf are
 * ambiguous and neither is shown. Doing it on paths rather than projections is
 * what lets the desktop backend read one project's rows instead of every row.
 */
export function selectProjectPathForLabel(
  projectPaths: readonly string[],
  label: string,
): string | null {
  const wanted = label.trim().toLowerCase();
  if (!wanted) return null;
  const matches = projectPaths.filter((path) => labelOf(path).trim().toLowerCase() === wanted);
  return matches.length === 1 ? matches[0] : null;
}

function labelOf(projectPath: string): string {
  const parts = projectPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}

function epoch(iso: string | null | undefined): number {
  return Date.parse(iso ?? "") || 0;
}

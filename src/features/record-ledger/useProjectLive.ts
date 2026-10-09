/**
 * Reads the intake buffer and hands 프로젝트 the projection for the project on
 * screen, or null when there is nothing honest to show.
 *
 * Two things have to stay true for this surface to keep its promise, and each
 * needs its own trigger:
 *
 * 1. **New observations must appear.** The buffer is written by the shell's
 *    poller, which now runs on every screen, so work observed while the user
 *    sits on 프로젝트 has to reach the page. Re-read whenever the poller
 *    publishes. (An earlier version read once per project selection, on the
 *    since-obsolete premise that the writer only ran while 세션 was mounted.)
 *
 * 2. **Freshness must decay on its own.** `freshness` is a function of `now`, so
 *    a projection derived once and left alone would keep asserting "진행 중"
 *    forever, which is precisely the invented present D11 forbids. The rows are
 *    already in memory, so re-deriving on a slow tick costs nothing and is what
 *    makes the honesty rule hold on screen rather than only in the model.
 *
 * Neither of these is polling the filesystem: this reads the intake store and
 * recomputes a pure derivation. The observation itself has its own opt-in and
 * its own visible state.
 *
 * ## Why it resolves the path before reading rows
 *
 * A label is the leaf of a project path, so the page knows a name and the store
 * is keyed by a path. Resolving first, against the distinct paths alone, means
 * the desktop backend reads **one project's** rows through its index instead of
 * every row it holds. The ambiguity rule is unchanged: two projects whose
 * folders share a leaf resolve to nothing, and the section stays hidden rather
 * than showing one project's work under another's name.
 */
import { useEffect, useMemo, useState } from "react";
import {
  freshnessOf,
  buildScopedProjection,
  buildProjectProjections,
  getIntakeStore,
  selectProjectPathForLabel,
  type IntakeRequestRow,
  type ProjectProjection,
} from "../../lib/live-intake";
import { useObservedSessions } from "../live-session/useAmbientObservation";

/** How often a projection is re-derived so its freshness can age. Coarse: the
 *  boundaries it crosses are minutes and hours wide. */
const FRESHNESS_TICK_MS = 60_000;

export function useProjectLive(label: string | null): ProjectProjection | null {
  const [rows, setRows] = useState<IntakeRequestRow[]>([]);
  const [tick, setTick] = useState(0);
  // Changes only when the poller published something, which #63 made meaningful
  // by suppressing unchanged background snapshots.
  const { snapshot } = useObservedSessions();
  const publishedAt = snapshot.lastPolledAt;

  useEffect(() => {
    if (!label || typeof window === "undefined") {
      setRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const store = getIntakeStore();
        const path = selectProjectPathForLabel(await store.listProjectPaths(), label);
        const next = path ? await store.listProjectRows(path) : [];
        if (!cancelled) setRows(next);
      } catch (error) {
        // Same contract as the writer: intake must never break a surface. A
        // project page without its live section is a smaller loss than a project
        // page that does not render.
        console.error("[live-intake] failed to read observed rows", error);
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [label, publishedAt]);

  useEffect(() => {
    if (!label) return;
    const timer = setInterval(() => setTick((n) => n + 1), FRESHNESS_TICK_MS);
    return () => clearInterval(timer);
  }, [label]);

  return useMemo(() => {
    if (!label || rows.length === 0) return null;
    // The rows are already one project's, because the label was resolved to a
    // path before they were read. So there is exactly one projection here, and
    // re-filtering it by label would be a check that cannot fail.
    const projections = buildProjectProjections(rows, { now: Date.now() });
    return projections[0] ?? null;
    // `tick` is the point: it is what lets freshness age without new rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, label, tick]);
}

/** A reviewed project's observed work: what the hook reads for. */
export type ConfirmedLiveScope = {
  projectId: string;
  /** The project's own name, for the projection's label. */
  label: string;
  /** Source files of the project's confirmed sessions (`liveSourcesOf`). */
  keys: readonly string[];
  /**
   * Whether a session seen in the folder named like the project is one the
   * operator has not placed anywhere yet. A session filed to another project,
   * or rejected for this one, is not "unconfirmed" and is not mentioned.
   * Absent, every non-member counts.
   */
  unplaced?: (sessionKey: string) => boolean;
};

export type ConfirmedProjectLive = {
  projection: ProjectProjection | null;
  /**
   * Sessions observed in the folder named like the project that are not its
   * confirmed members: shown apart, never counted as the project's work.
   */
  unconfirmedObserved: number;
};

/** What one read of a reviewed project's sessions returned. */
export type ConfirmedLiveRead = { projectId: string; rows: IntakeRequestRow[]; unconfirmed: number };

type IntakeReader = Pick<
  ReturnType<typeof getIntakeStore>,
  "listSessionRows" | "listProjectPaths" | "listProjectRows"
>;

/**
 * Reads the intake rows of a reviewed project's confirmed sessions, one
 * session at a time through the store's session index, so the cost follows
 * the project's size, not the buffer's history.
 *
 * Also counts, apart, the sessions observed in the folder named like the
 * project that are not its members. That count is never folded into the
 * project's rows: the folder name is a hint for the user, not a join.
 */
export async function readConfirmedLive(
  store: IntakeReader,
  scope: ConfirmedLiveScope,
  now: number = Date.now(),
): Promise<ConfirmedLiveRead> {
  const keys = [...scope.keys];
  const perSession = await Promise.all(keys.map((key) => store.listSessionRows(key)));
  const folder = selectProjectPathForLabel(await store.listProjectPaths(), scope.label);
  const confirmed = new Set(keys);
  const unconfirmed = folder
    ? new Set(
        (await store.listProjectRows(folder))
          // Only what is still worth saying: an observation gone stale is history.
          .filter((row) => freshnessOf(row.observedAt, now) !== "stale")
          .map((row) => row.sessionKey)
          .filter((key) => !confirmed.has(key) && (scope.unplaced?.(key) ?? true)),
      ).size
    : 0;
  return {
    projectId: scope.projectId,
    // The store indexes by session already; filtering each answer by its own
    // key keeps a backend that ignores the key from leaking or doubling rows.
    rows: perSession.flatMap((rows, index) => rows.filter((row) => row.sessionKey === keys[index])),
    unconfirmed,
  };
}

/**
 * The projection for the scope on screen from the last read, or nothing.
 * A read for another project (a switch landed mid-read) shows nothing, and a
 * session unfiled since the read leaves at once, before the next read returns.
 */
export function projectConfirmedLive(
  read: ConfirmedLiveRead | null,
  scope: ConfirmedLiveScope | null,
  now: number,
): ConfirmedProjectLive {
  if (!scope || !read || read.projectId !== scope.projectId) return { projection: null, unconfirmedObserved: 0 };
  const current = new Set(scope.keys);
  return {
    projection: buildScopedProjection(
      read.rows.filter((row) => current.has(row.sessionKey)),
      { now, label: scope.label },
    ),
    unconfirmedObserved: read.unconfirmed,
  };
}

/**
 * 현재 상황 for a reviewed project: the intake rows of its confirmed sessions,
 * whatever folders the agents worked in. Membership decides which sessions
 * are relevant; the rows decide what was observed and how current it is.
 *
 * Pass null while the kernel is loading: an empty member list then means
 * "not known yet", not "no members", and nothing is shown or read.
 */
export function useConfirmedProjectLive(scope: ConfirmedLiveScope | null): ConfirmedProjectLive {
  const [read, setRead] = useState<ConfirmedLiveRead | null>(null);
  const [tick, setTick] = useState(0);
  const { snapshot } = useObservedSessions();
  const publishedAt = snapshot.lastPolledAt;
  const projectId = scope?.projectId ?? null;
  const keysKey = scope ? scope.keys.join("\n") : "";
  const label = scope?.label ?? "";

  useEffect(() => {
    if (!scope || typeof window === "undefined") {
      setRead(null);
      return;
    }
    // Another project's rows never show while this one's load.
    setRead((current) => (current && current.projectId === scope.projectId ? current : null));
    let cancelled = false;
    void readConfirmedLive(getIntakeStore(), scope)
      .then((next) => {
        if (!cancelled) setRead(next);
      })
      .catch((error) => {
        // Same contract as the folder hook: intake never breaks the page.
        console.error("[live-intake] failed to read confirmed sessions' rows", error);
        if (!cancelled) setRead({ projectId: scope.projectId, rows: [], unconfirmed: 0 });
      });
    return () => {
      cancelled = true;
    };
    // `scope` is read through its parts, so a new object with the same parts
    // does not re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, keysKey, label, publishedAt]);

  useEffect(() => {
    if (!projectId) return;
    const timer = setInterval(() => setTick((n) => n + 1), FRESHNESS_TICK_MS);
    return () => clearInterval(timer);
  }, [projectId]);

  return useMemo(
    () => projectConfirmedLive(read, scope, Date.now()),
    // `tick` lets freshness age without new rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [read, projectId, keysKey, label, tick],
  );
}

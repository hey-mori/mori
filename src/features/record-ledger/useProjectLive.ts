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

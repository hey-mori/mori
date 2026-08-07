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
 * Neither of these is polling the filesystem: this reads localStorage and
 * recomputes a pure derivation. The observation itself has its own opt-in and
 * its own visible state.
 */
import { useEffect, useMemo, useState } from "react";
import {
  buildProjectProjections,
  IntakeBrowserStore,
  selectProjectionForLabel,
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
    try {
      setRows(new IntakeBrowserStore().listAllRows());
    } catch (error) {
      // Same contract as the writer: intake must never break a surface. A
      // project page without its live section is a smaller loss than a project
      // page that does not render.
      console.error("[live-intake] failed to read observed rows", error);
      setRows([]);
    }
  }, [label, publishedAt]);

  useEffect(() => {
    if (!label) return;
    const timer = setInterval(() => setTick((n) => n + 1), FRESHNESS_TICK_MS);
    return () => clearInterval(timer);
  }, [label]);

  return useMemo(() => {
    if (!label || rows.length === 0) return null;
    const projections = buildProjectProjections(rows, { now: Date.now() });
    return selectProjectionForLabel(projections, label);
    // `tick` is the point: it is what lets freshness age without new rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, label, tick]);
}

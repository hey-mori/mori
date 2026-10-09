/**
 * The last durable-document adoption report, for the diagnostics export.
 *
 * The pass itself runs in `prepareDurableReads` on every desktop launch,
 * before the read source is decided: once to adopt classes newly made durable,
 * and from then on to repair any mirror write a quit lost (it copies only
 * bodies localStorage holds newer than SQLite). It used to run a second time
 * from an App effect, which raced the first on an upgrade launch.
 */
import type { AdoptionReport } from "../lib/storage/adoptDurableDocuments";

let lastReport: AdoptionReport | null = null;

/** What the pass did, for the diagnostics export. `null` until it has run. */
export function getLastAdoptionReport(): AdoptionReport | null {
  return lastReport;
}

export function recordAdoptionReport(report: AdoptionReport): void {
  lastReport = report;
}

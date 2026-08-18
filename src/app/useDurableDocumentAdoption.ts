/**
 * Runs the one-time durable-document adoption pass, once, on desktop.
 *
 * Startup rather than on demand, because the pass exists to make SQLite hold
 * what localStorage already holds, and the sooner it does the smaller the
 * window where the two disagree.
 *
 * Fire and forget by design: nothing on screen depends on it, and reads stay on
 * localStorage until R6, so a pass that fails costs the user nothing today. It
 * simply runs again next launch, since the marker is only written after a clean
 * pass.
 */
import { useEffect } from "react";
import { isTauriRuntime, tauriCommands } from "../lib/desktop";
import {
  adoptDurableDocuments,
  hasAdopted,
  type AdoptionReport,
} from "../lib/storage/adoptDurableDocuments";

let lastReport: AdoptionReport | null = null;

/** What the pass did, for the diagnostics export. `null` until it has run. */
export function getLastAdoptionReport(): AdoptionReport | null {
  return lastReport;
}

export function useDurableDocumentAdoption(): void {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (hasAdopted(window.localStorage)) return;

    let cancelled = false;
    void (async () => {
      try {
        const report = await adoptDurableDocuments({
          storage: window.localStorage,
          target: {
            saveDocuments: (documents) => tauriCommands.saveDurableDocumentRows(documents),
            deleteDocument: (kind, ownerId) =>
              tauriCommands.deleteDurableDocumentRow(kind, ownerId),
          },
          listExisting: (kind) => tauriCommands.listDurableDocumentRows(kind),
          now: () => new Date().toISOString(),
        });
        if (cancelled) return;
        lastReport = report;
        if (report.stoppedBecause) {
          console.info(
            `[adoption] stopped after ${report.written} document(s): ${report.stoppedBecause}`,
          );
        }
      } catch (error) {
        // The pass already returns rather than throws for storage failures, so
        // reaching here means a defect in it. Swallowed anyway: a broken
        // adoption must not take down a launch, and it retries next time.
        console.error("[adoption] durable document pass failed", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}

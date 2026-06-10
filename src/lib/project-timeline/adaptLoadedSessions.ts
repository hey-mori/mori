/**
 * Adapt the shared Project Memory session loader output into the input the
 * project-aggregate timeline builder reads.
 *
 * `loadProjectMemorySessions` already does the runtime-aware loading (browser
 * localStorage + desktop SQLite, capped, non-mutating). This is the thin,
 * pure seam from its `ProjectMemoryLoadedSession` to the timeline's
 * `LoadedProjectSession`: a loaded body becomes a real band, a metadata-only or
 * failed load becomes a partial band flagged honestly.
 */
import type { ProjectMemoryLoadedSession } from "../project-memory/projectMemoryModel";
import type { LoadedProjectSession } from "./buildProjectTimeline";

export function adaptLoadedSessionsForTimeline(
  loaded: readonly ProjectMemoryLoadedSession[],
): LoadedProjectSession[] {
  return loaded.map((session) => {
    const startedAt = session.startedAt ?? session.savedAt ?? "";
    const endedAt = session.endedAt ?? session.startedAt ?? session.savedAt ?? "";
    const view =
      session.loadStatus === "loaded"
        ? {
            events: session.events,
            sources: session.sources,
            issues: session.issues,
            decisions: session.decisions,
          }
        : null;
    return {
      meta: {
        id: session.sessionId,
        title: session.title,
        startedAt,
        endedAt,
        eventCount: session.events.length,
        decisionCount: session.decisions.length,
        openIssueCount: session.issues.filter((issue) => issue.status !== "resolved").length,
      },
      view,
    };
  });
}

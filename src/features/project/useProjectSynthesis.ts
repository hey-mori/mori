import { useMemo } from "react";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { buildDemoSessionContent } from "../../lib/demo/demoSessionContent";
import {
  buildProjectSynthesis,
  type ProjectSessionContent,
  type ProjectSynthesis,
} from "../../lib/project/projectSynthesis";

/**
 * Gather a project's per-session content and roll it up into a synthesis.
 *
 * The project page surfaces the same roll-up in two places — the overview band
 * (magnitudes) and the synthesis section (the items themselves). Loading each
 * session's memory body is the expensive part, so it lives here once and both
 * consumers share the result instead of each re-reading every session.
 *
 * Self-contained and read-only: each session resolves to a stored memory body
 * or a demo fixture, and an unreadable session simply contributes nothing.
 */
export function useProjectSynthesis(
  sessions: ReadonlyArray<{ sessionId: string; title: string }>,
): ProjectSynthesis {
  const repository = useMemo(() => createBrowserDraftRepository(), []);

  const content = useMemo<ProjectSessionContent[]>(() => {
    return sessions.map((entry) => {
      let issues: ProjectSessionContent["issues"] = [];
      let decisions: ProjectSessionContent["decisions"] = [];
      let nextActions: ProjectSessionContent["nextActions"] = [];
      try {
        const body = repository.loadSessionMemoryBody(entry.sessionId);
        if (body) {
          issues = body.issues;
          decisions = body.decisions;
          nextActions = body.nextActions;
        } else {
          const demo = buildDemoSessionContent(entry.sessionId);
          if (demo) {
            issues = demo.issues ?? [];
            decisions = demo.decisions ?? [];
            nextActions = demo.nextActions ?? [];
          }
        }
      } catch {
        // Unreadable session — contributes nothing, never throws upward.
      }
      return { sessionId: entry.sessionId, title: entry.title, issues, decisions, nextActions };
    });
  }, [sessions, repository]);

  return useMemo(() => buildProjectSynthesis(content), [content]);
}

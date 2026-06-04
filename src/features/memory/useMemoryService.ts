import { useEffect, useMemo, useState } from "react";
import { selectSessionView, useSessionStore } from "../../app/sessionStore";
import { getAcceptedMemoryRepository } from "../../lib/project-memory/acceptedMemoryRepository";
import type { MemoryCapabilityInput } from "../../lib/memory-api/memoryApiTypes";
import type { QuickPassAnalysisSettings } from "../../lib/analysis/analysisSettings";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../../lib/storage/storageTypes";

/**
 * The data-binding seam for the memory-api facade
 * (`docs/design/memory-as-a-service.md` §3.3). Loads the active project's
 * accepted memory + review actions and reads the active session's evidence
 * and the Quick Pass settings, returning the one `MemoryCapabilityInput`
 * every memory consumer runs against. The warehouse builds this inline; any
 * consumer outside it (the Ask Mori surface, later Home / ⌘K) calls this
 * hook so it never re-implements the loading.
 */
export function useMemoryService(): {
  input: MemoryCapabilityInput;
  settings: QuickPassAnalysisSettings;
  loading: boolean;
} {
  const view = useSessionStore(selectSessionView);
  const settings = useSessionStore((state) => state.analysisSettings);
  const projectId = view.project.id || "default";

  const [memories, setMemories] = useState<StoredAcceptedProjectMemory[]>([]);
  const [reviewActions, setReviewActions] = useState<StoredMemoryReviewAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const repository = getAcceptedMemoryRepository();
    void Promise.all([
      repository.listAcceptedProjectMemories(projectId),
      repository.listMemoryReviewActions(projectId),
    ])
      .then(([memoryResult, actionResult]) => {
        if (cancelled) return;
        setMemories(memoryResult.data);
        setReviewActions(actionResult.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const input = useMemo<MemoryCapabilityInput>(
    () => ({
      acceptedMemories: memories,
      reviewActions,
      events: view.events,
      sources: view.sources,
    }),
    [memories, reviewActions, view.events, view.sources],
  );

  return { input, settings, loading };
}

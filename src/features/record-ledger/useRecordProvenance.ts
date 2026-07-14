/**
 * useRecordProvenance · loads a record's origin and history for the inspector.
 *
 * Origin is a relationship, not a unit (architecture doc §1): a record does
 * not own its raw text, its `Source` does. This hook resolves the origin
 * source (with the preserved raw body) and the append-only revision trail so
 * the inspector can show where a record came from and how it changed, on
 * demand, without those living on the record itself.
 */
import { useEffect, useState } from "react";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import type { KernelRevision, KernelSource } from "../../lib/record-kernel/kernelTypes";

export type RecordProvenance = {
  source: KernelSource | null;
  revisions: KernelRevision[];
  loading: boolean;
};

export function useRecordProvenance(recordId: string | null): RecordProvenance {
  const [source, setSource] = useState<KernelSource | null>(null);
  const [revisions, setRevisions] = useState<KernelRevision[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!recordId) {
      setSource(null);
      setRevisions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const repo = getKernelRepository();
    void (async () => {
      const [links, revisionResult] = await Promise.all([
        repo.listSourceLinksForRecord(recordId),
        repo.listRevisions(recordId),
      ]);
      const originLink = links.data.find((link) => link.role === "origin") ?? links.data[0];
      const sourceResult = originLink ? await repo.getSource(originLink.sourceId) : null;
      if (cancelled) return;
      setSource(sourceResult?.data ?? null);
      setRevisions(revisionResult.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  return { source, revisions, loading };
}

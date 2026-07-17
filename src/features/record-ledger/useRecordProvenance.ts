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
import type {
  KernelRelation,
  KernelRevision,
  KernelSource,
} from "../../lib/record-kernel/kernelTypes";

export type RecordProvenance = {
  source: KernelSource | null;
  revisions: KernelRevision[];
  relations: KernelRelation[];
  loading: boolean;
};

export function useRecordProvenance(
  recordId: string | null,
  reloadKey: string | number = 0,
): RecordProvenance {
  const [source, setSource] = useState<KernelSource | null>(null);
  const [revisions, setRevisions] = useState<KernelRevision[]>([]);
  const [relations, setRelations] = useState<KernelRelation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Clear FIRST, on every id change, not only when the id goes null. The reset
    // used to live inside the !recordId branch, so switching from record A to
    // record B left A's history, relations and 원문 on screen under B's title
    // until B's async read landed. Provenance that belongs to another record is
    // worse than no provenance: it is the one thing this app promises not to get
    // wrong, and a stale trail is indistinguishable from a true one.
    setSource(null);
    setRevisions([]);
    setRelations([]);
    if (!recordId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const repo = getKernelRepository();
    void (async () => {
      const [links, revisionResult, relationResult] = await Promise.all([
        repo.listSourceLinksForRecord(recordId),
        repo.listRevisions(recordId),
        repo.listRelationsForRecord(recordId),
      ]);
      const originLink = links.data.find((link) => link.role === "origin") ?? links.data[0];
      const sourceResult = originLink ? await repo.getSource(originLink.sourceId) : null;
      if (cancelled) return;
      setSource(sourceResult?.data ?? null);
      setRevisions(revisionResult.data);
      setRelations(relationResult.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [recordId, reloadKey]);

  return { source, revisions, relations, loading };
}

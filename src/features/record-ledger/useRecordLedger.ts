/**
 * useRecordLedger · the React seam over the record kernel for the 오늘 and
 * 인박스 surfaces.
 *
 * Loads records + user schemas through `KernelRepository`, runs the capture
 * pipeline on new input, and persists the outcome (source first, then each
 * record with its revision and origin link) so the raw-input-retention and
 * visible-and-reversible invariants hold at the write boundary. Status
 * changes (confirm a candidate, revert a provisional) go through
 * `applyRecordPatch` so every transition is an audited revision.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { runCapturePipeline, type CaptureInput, type CaptureOutcome } from "../../lib/capture";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import { applyRecordPatch } from "../../lib/record-kernel/recordFactory";
import { createSchemaRegistry, type SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import type { MoriRecord, RecordStatus, SchemaDefinition } from "../../lib/record-kernel/kernelTypes";

export type RecordLedger = {
  records: MoriRecord[];
  registry: SchemaRegistry;
  loading: boolean;
  reload: () => Promise<void>;
  capture: (input: CaptureInput) => Promise<CaptureOutcome>;
  setStatus: (record: MoriRecord, status: RecordStatus) => Promise<void>;
};

export function useRecordLedger(): RecordLedger {
  const [records, setRecords] = useState<MoriRecord[]>([]);
  const [userSchemas, setUserSchemas] = useState<SchemaDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const registry = useMemo(() => {
    try {
      return createSchemaRegistry(userSchemas);
    } catch {
      // A corrupt persisted user schema must not brick the ledger; fall back
      // to the system registry and surface the schema issue elsewhere.
      return createSchemaRegistry();
    }
  }, [userSchemas]);

  const reload = useCallback(async () => {
    const repo = getKernelRepository();
    const [recordsResult, schemasResult] = await Promise.all([
      repo.listRecords(),
      repo.listUserSchemas(),
    ]);
    setUserSchemas(schemasResult.data);
    setRecords(recordsResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const capture = useCallback(
    async (input: CaptureInput) => {
      const repo = getKernelRepository();
      const outcome = runCapturePipeline(input, registry);
      // Source first: the raw trace is preserved before any interpretation,
      // so a later failure never loses what the user typed.
      await repo.saveSource(outcome.source);
      for (const item of outcome.records) {
        await repo.saveRecord(item.created.record, item.created.revision);
        await repo.saveSourceLink(item.sourceLink);
      }
      await reload();
      return outcome;
    },
    [registry, reload],
  );

  const setStatus = useCallback(
    async (record: MoriRecord, status: RecordStatus) => {
      if (record.status === status) return;
      const repo = getKernelRepository();
      const { record: next, revision } = applyRecordPatch(record, { status }, "user", registry);
      await repo.saveRecord(next, revision);
      await reload();
    },
    [registry, reload],
  );

  return { records, registry, loading, reload, capture, setStatus };
}

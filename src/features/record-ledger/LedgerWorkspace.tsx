/**
 * 기록 · the document workspace (v2, docs/design/record-workspace/
 * v2-document-workspace.md).
 *
 * Two panes, no right panel: a project-grouped note explorer on the left and
 * a center editor that reads and edits the selected record in place, or hosts
 * a new capture. Records that need a decision (policy-held candidates and
 * date-undecided notes) surface in the explorer's pinned 확인할 것 group and
 * are resolved in the editor. The calendar is a separate global view.
 */
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../../components/layout/PageShell";
import { useAppStore } from "../../app/store";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { useRecordLedger } from "./useRecordLedger";
import { NoteExplorer } from "./NoteExplorer";
import { DocumentEditor } from "./DocumentEditor";
import { isDateUndecided } from "./dateResolution";
import type { ExplorerSort } from "./noteExplorerModel";
import { displayTime, ledgerVisibleRecords } from "./recordPresentation";

export function LedgerWorkspace() {
  const ledger = useRecordLedger();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ExplorerSort>("date");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 기록 opens ready to capture (approved design: capture/organize/review are one
  // flow on one screen). The explorer still opens any existing note; a calendar
  // deep-link (openRecordId) overrides this on mount to show that record.
  const [composing, setComposing] = useState(true);
  const now = useMemo(() => new Date(), []);
  const openRecordId = useAppStore((state) => state.openRecordId);
  const clearOpenRecord = useAppStore((state) => state.clearOpenRecord);
  const newRecordRequest = useAppStore((state) => state.newRecordRequest);
  const clearNewRecordRequest = useAppStore((state) => state.clearNewRecordRequest);

  // The global calendar can ask 기록 to open a specific record.
  useEffect(() => {
    if (!openRecordId) return;
    setSelectedId(openRecordId);
    setComposing(false);
    clearOpenRecord();
  }, [openRecordId, clearOpenRecord]);

  // A global create action (the sidebar +) can ask 기록 to start a capture.
  useEffect(() => {
    if (!newRecordRequest) return;
    setComposing(true);
    setSelectedId(null);
    clearNewRecordRequest();
  }, [newRecordRequest, clearNewRecordRequest]);

  const candidates = useMemo(
    () => byNewest(ledger.records.filter((record) => record.status === "candidate")),
    [ledger.records],
  );
  const dateUnknown = useMemo(
    () => byNewest(ledgerVisibleRecords(ledger.records).filter(isDateUndecided)),
    [ledger.records],
  );
  const selected = useMemo(
    () => ledger.records.find((record) => record.id === selectedId) ?? null,
    [ledger.records, selectedId],
  );
  // The capture canvas's 오늘 section: today's ledger-visible records (agent
  // sessions live in 세션), newest first.
  const todayRecords = useMemo(() => {
    const todayIso = localIsoDay(now);
    return byNewest(
      ledgerVisibleRecords(ledger.records).filter(
        (record) =>
          record.schemaId !== "agent-session" &&
          displayTime(record).iso.slice(0, 10) === todayIso,
      ),
    );
  }, [ledger.records, now]);

  const openRecord = (recordId: string) => {
    setSelectedId(recordId);
    setComposing(false);
  };
  const startNew = () => {
    setComposing(true);
    setSelectedId(null);
  };
  // Saving stays on the canvas: the new record appears in the 오늘 section
  // right below the composer (Journal feedback loop), and the composer's own
  // post-save state offers 이어서 쓰기 / 되돌리기.
  const onSaved = (_savedRecordIds: string[]) => {};

  // A selected record that vanishes (discarded from the editor) clears the pane.
  useEffect(() => {
    if (selectedId && !ledger.loading && !selected) setSelectedId(null);
  }, [selectedId, selected, ledger.loading]);

  return (
    <PageShell maxWidth="full">
      <div className="ledger ledger-docs">
        <NoteExplorer
          ledger={ledger}
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          selectedId={selectedId}
          candidates={candidates}
          dateUnknown={dateUnknown}
          composing={composing}
          onSelect={openRecord}
          onNew={startNew}
          now={now}
        />
        <DocumentEditor
          record={selected}
          composing={composing}
          ledger={ledger}
          todayRecords={todayRecords}
          onOpenRecord={openRecord}
          onUpdate={(patch) => {
            if (selected) void ledger.updateRecord(selected, patch);
          }}
          onSaved={onSaved}
          now={now}
        />
      </div>
    </PageShell>
  );
}

function byNewest(records: MoriRecord[]): MoriRecord[] {
  return [...records].sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
}

function localIsoDay(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

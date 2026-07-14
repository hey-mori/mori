/**
 * 오늘 · the first surface of the record kernel (K2).
 *
 * Quick capture leads: the user types anything, Mori preserves the raw text
 * and proposes structured records under the apply policy. What auto-applies
 * or lands provisional appears in the day's ledger below; what needs a look
 * is surfaced as a quiet count linking to 인박스. Low ceremony by design
 * (architecture doc §16.3): the user captures and glances.
 */
import { useMemo, useState } from "react";
import { Inbox, Sparkles } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { Button } from "../../components/ui/Button";
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import { useAppStore } from "../../app/store";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { useRecordLedger } from "./useRecordLedger";
import { RecordInspector } from "./RecordInspector";
import { displayTime, schemaLabel, statusBadge } from "./recordPresentation";

/** Records that belong on the ledger: applied work, newest first. Candidates
 *  (the confirm queue) live in 인박스, not here. */
function ledgerRecords(records: MoriRecord[]): MoriRecord[] {
  return records
    .filter((record) => record.status === "active" || record.status === "provisional")
    .sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
}

export function TodayView() {
  const { records, registry, entities, loading, capture, renameEntity } = useRecordLedger();
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ledger = useMemo(() => ledgerRecords(records), [records]);
  const candidateCount = useMemo(
    () => records.filter((record) => record.status === "candidate").length,
    [records],
  );
  const selected = useMemo(
    () => ledger.find((record) => record.id === selectedId) ?? null,
    [ledger, selectedId],
  );

  const submit = async () => {
    const content = draft.trim();
    if (content.length === 0 || busy) return;
    setBusy(true);
    try {
      const outcome = await capture({ kind: "text", content });
      setDraft("");
      setNotice(describeOutcome(outcome.records.map((item) => item.decision)));
    } finally {
      setBusy(false);
    }
  };

  const inboxAction =
    candidateCount > 0 ? (
      <Button icon={Inbox} onClick={() => setCurrentView("captureInbox")}>
        확인 필요 {candidateCount}
      </Button>
    ) : undefined;

  return (
    <PageShell maxWidth="full" actionBar={<ActionBar label="오늘" end={inboxAction} />}>
      <div className={`ledger${selected ? " has-inspector" : ""}`}>
        <div className="ledger-main">
        <form
          className="ledger-capture"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <textarea
            className="ledger-capture-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="오늘 한 일, 배운 것, 떠오른 생각을 그냥 적어보세요"
            aria-label="빠른 기록"
            rows={2}
          />
          <div className="ledger-capture-foot">
            <span className="ledger-capture-hint">
              운동 · 학습 · 자료 · 메모를 알아서 정리합니다
            </span>
            <Button
              type="submit"
              variant="primary"
              icon={Sparkles}
              disabled={draft.trim().length === 0 || busy}
            >
              정리
            </Button>
          </div>
        </form>

        {notice ? (
          <p className="ledger-notice" role="status">
            {notice}
          </p>
        ) : null}

        {loading ? null : ledger.length === 0 ? (
          <EmptyState
            compact
            icon={Sparkles}
            title="아직 기록이 없습니다"
            description="위에 무엇이든 적으면 Mori가 활동·지식·기록으로 정리해 여기에 쌓습니다."
          />
        ) : (
          <ul className="ledger-list">
            {ledger.map((record) => {
              const badge = statusBadge(record.status);
              const time = displayTime(record);
              return (
                <li key={record.id}>
                  <button
                    type="button"
                    className={`ledger-row${record.id === selectedId ? " is-selected" : ""}`}
                    onClick={() =>
                      setSelectedId((current) => (current === record.id ? null : record.id))
                    }
                  >
                    <div className="ledger-row-head">
                      <span className="ledger-row-kind">{schemaLabel(record, registry)}</span>
                      <span className="ledger-row-title">{record.title}</span>
                      {badge ? (
                        <BaseStatusBadge tone={badge.tone}>{badge.label}</BaseStatusBadge>
                      ) : null}
                    </div>
                    <div className="ledger-row-meta">
                      <span>
                        {time.isCaptureFallback ? "기록함 " : ""}
                        {formatClaudeRelativeKo(time.iso)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>
        {selected ? (
          <RecordInspector
            record={selected}
            registry={registry}
            entities={entities}
            onRenameEntity={(entityId, newName) => void renameEntity(entityId, newName)}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </PageShell>
  );
}

/** A calm one-liner summarising what the capture produced. */
function describeOutcome(decisions: Array<"auto" | "provisional" | "confirm">): string {
  if (decisions.length === 0) return "기록할 내용을 찾지 못했습니다.";
  if (decisions.every((decision) => decision === "confirm")) {
    return "확인이 필요한 항목으로 두었습니다. 인박스에서 검토하세요.";
  }
  if (decisions.some((decision) => decision === "confirm")) {
    return "일부는 정리하고, 일부는 확인이 필요해 인박스에 두었습니다.";
  }
  if (decisions.some((decision) => decision === "provisional")) {
    return "정리했습니다. 잠정으로 표시된 항목은 언제든 되돌릴 수 있습니다.";
  }
  return "정리했습니다.";
}

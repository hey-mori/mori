/**
 * 인박스 · the confirm queue (K2).
 *
 * Records the apply policy could not auto-apply land here as candidates:
 * uncertain interpretations, sensitive content, anything needing a look.
 * Each card offers 반영 (accept into the ledger) or 무시 (discard). A second
 * section lists provisional records, applied but reversible, so the user can
 * confirm or undo Mori's automatic organizing. This is the exception path;
 * a user who never opens it still gets a well-organized ledger from 오늘.
 */
import { useMemo } from "react";
import { Check, Inbox as InboxIcon, RotateCcw, X } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { Button } from "../../components/ui/Button";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { useRecordLedger } from "./useRecordLedger";
import { displayTime, schemaLabel } from "./recordPresentation";

export function CaptureInboxView() {
  const { records, registry, loading, setStatus } = useRecordLedger();

  const candidates = useMemo(
    () => byNewest(records.filter((record) => record.status === "candidate")),
    [records],
  );
  const provisional = useMemo(
    () => byNewest(records.filter((record) => record.status === "provisional")),
    [records],
  );

  return (
    <PageShell maxWidth="full" actionBar={<ActionBar label="인박스" />}>
      <div className="inbox">
        {loading ? null : candidates.length === 0 && provisional.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title="확인할 항목이 없습니다"
            description="Mori가 정리하다가 확인이 필요하다고 본 것만 여기에 모입니다. 지금은 비어 있어요."
          />
        ) : (
          <>
            {candidates.length > 0 ? (
              <section className="inbox-section">
                <header className="inbox-section-head">
                  <h2>확인이 필요한 항목</h2>
                  <span className="inbox-section-count">{candidates.length}</span>
                </header>
                <ul className="inbox-list">
                  {candidates.map((record) => (
                    <li key={record.id} className="inbox-card">
                      <div className="inbox-card-body">
                        <div className="inbox-card-head">
                          <span className="inbox-card-kind">{schemaLabel(record, registry)}</span>
                          <span className="inbox-card-title">{record.title}</span>
                        </div>
                        {record.body && record.body !== record.title ? (
                          <p className="inbox-card-summary">{record.body}</p>
                        ) : null}
                        <span className="inbox-card-time">
                          {formatClaudeRelativeKo(displayTime(record).iso)}
                        </span>
                      </div>
                      <div className="inbox-card-actions">
                        <Button
                          variant="primary"
                          size="sm"
                          icon={Check}
                          onClick={() => void setStatus(record, "active")}
                        >
                          반영
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={X}
                          onClick={() => void setStatus(record, "discarded")}
                        >
                          무시
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {provisional.length > 0 ? (
              <section className="inbox-section">
                <header className="inbox-section-head">
                  <h2>자동으로 정리됨</h2>
                  <span className="inbox-section-count">{provisional.length}</span>
                </header>
                <p className="inbox-section-note">
                  Mori가 정리해 이미 쓰고 있는 잠정 기록입니다. 확정하거나 되돌릴 수 있습니다.
                </p>
                <ul className="inbox-list">
                  {provisional.map((record) => (
                    <li key={record.id} className="inbox-card is-provisional">
                      <div className="inbox-card-body">
                        <div className="inbox-card-head">
                          <span className="inbox-card-kind">{schemaLabel(record, registry)}</span>
                          <span className="inbox-card-title">{record.title}</span>
                        </div>
                        <span className="inbox-card-time">
                          {formatClaudeRelativeKo(displayTime(record).iso)}
                        </span>
                      </div>
                      <div className="inbox-card-actions">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Check}
                          onClick={() => void setStatus(record, "active")}
                        >
                          확정
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={RotateCcw}
                          onClick={() => void setStatus(record, "discarded")}
                        >
                          되돌리기
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  );
}

function byNewest(records: MoriRecord[]): MoriRecord[] {
  return [...records].sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
}

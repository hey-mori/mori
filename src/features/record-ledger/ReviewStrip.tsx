/**
 * ReviewStrip · the 확인할 것 strip above the timeline (R4, screen M5).
 *
 * One place for everything that needs a decision: records the apply policy
 * held back (반영 / 무시) and records with no activity date yet (a
 * resolution card, reason first, context-fit choices). It disappears
 * entirely when nothing is pending. No separate inbox screen.
 */
import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordLedger } from "./useRecordLedger";
import { dateSituation, type DateChoice } from "./dateResolution";
import { displayTime, schemaLabel } from "./recordPresentation";

export function ReviewStrip({
  candidates,
  dateUnknown,
  ledger,
  now,
}: {
  candidates: MoriRecord[];
  dateUnknown: MoriRecord[];
  ledger: RecordLedger;
  now: Date;
}) {
  const total = candidates.length + dateUnknown.length;
  if (total === 0) return null;

  return (
    <section className="ledger-review">
      <header className="ledger-review-head">
        <h2>확인할 것</h2>
        <span className="ledger-review-count">{total}</span>
      </header>
      <ul className="review-list">
        {candidates.map((record) => (
          <CandidateItem key={record.id} record={record} ledger={ledger} />
        ))}
        {dateUnknown.map((record) => (
          <DateItem key={record.id} record={record} ledger={ledger} now={now} />
        ))}
      </ul>
    </section>
  );
}

/** A policy-held record: apply it or dismiss it, in place. */
function CandidateItem({ record, ledger }: { record: MoriRecord; ledger: RecordLedger }) {
  return (
    <li className="review-item">
      <div className="review-item-main">
        <div className="review-item-head">
          <span className="review-item-kind">{schemaLabel(record, ledger.registry)}</span>
          <span className="review-item-title">{record.title}</span>
        </div>
        {record.body && record.body !== record.title ? (
          <p className="review-item-summary">{record.body}</p>
        ) : null}
        <span className="review-item-reason">{formatClaudeRelativeKo(displayTime(record).iso)}에 기록</span>
      </div>
      <div className="review-item-actions">
        <Button variant="primary" size="sm" icon={Check} onClick={() => void ledger.setStatus(record, "active")}>
          반영
        </Button>
        <Button variant="ghost" size="sm" icon={X} onClick={() => void ledger.setStatus(record, "discarded")}>
          무시
        </Button>
      </div>
    </li>
  );
}

/** A date-undecided record: reason first, then context-fit choices. */
function DateItem({ record, ledger, now }: { record: MoriRecord; ledger: RecordLedger; now: Date }) {
  const situation = useMemo(() => dateSituation(record, now), [record, now]);
  const [picking, setPicking] = useState(false);
  if (!situation) return null;

  const apply = (choice: DateChoice) => {
    if (choice.kind === "set") void ledger.setActivityDate(record, choice.date);
    else if (choice.kind === "keep-none") void ledger.setActivityDate(record, null);
    else setPicking(true);
  };

  return (
    <li className="review-item is-date">
      <div className="review-item-main">
        <div className="review-item-head">
          <span className="review-item-kind">{schemaLabel(record, ledger.registry)}</span>
          <span className="review-item-title">{record.title}</span>
        </div>
        <p className="review-item-reason">{situation.reason}</p>
        <div className="review-item-choices">
          {situation.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`review-choice${choice.kind === "keep-none" ? " is-quiet" : ""}`}
              onClick={() => apply(choice)}
            >
              {choice.label}
            </button>
          ))}
          {picking ? (
            <input
              type="date"
              className="review-date-input"
              autoFocus
              onChange={(event) => {
                if (event.target.value) void ledger.setActivityDate(record, event.target.value);
              }}
              aria-label={`${record.title} 날짜 선택`}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}

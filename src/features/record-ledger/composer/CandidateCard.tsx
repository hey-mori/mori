/**
 * CandidateCard · one proposed record in the composer's reviewing state
 * (record-workspace interaction spec §2).
 *
 * Density follows the apply decision (approved 5.3): auto/provisional
 * candidates start collapsed to a one-line summary; confirm candidates start
 * expanded. Every card is editable in place: type, title, date (with the
 * inference 근거 shown honestly), context, and exclusion. Edits are staged
 * in the machine and become user revisions at commit.
 */
import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp } from "lucide-react";
import type { CaptureRecordOutcome } from "../../../lib/capture";
import type { RecordLedger } from "../useRecordLedger";
import type { CandidateEdit } from "./composerMachine";

function dateLabel(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

export function CandidateCard({
  item,
  ledger,
  edit,
  excluded,
  disabled,
  onEdit,
  onToggleExclude,
}: {
  item: CaptureRecordOutcome;
  ledger: RecordLedger;
  edit: CandidateEdit | undefined;
  excluded: boolean;
  disabled: boolean;
  onEdit: (edit: CandidateEdit) => void;
  onToggleExclude: () => void;
}) {
  const record = item.created.record;
  // auto/provisional start collapsed (they would save without a look);
  // confirm starts expanded because the user's decision is the point.
  const [expanded, setExpanded] = useState(item.decision === "confirm");

  const schemaId = edit?.schemaId ?? record.schemaId;
  const title = edit?.title ?? record.title;
  const occurredStart =
    edit?.occurredStart !== undefined
      ? (edit.occurredStart ?? undefined)
      : record.occurredStart?.slice(0, 10);
  const contextId = edit?.contextIds !== undefined ? (edit.contextIds[0] ?? "") : (record.contextIds[0] ?? "");
  const dateEdited = edit?.occurredStart !== undefined;

  const schemaName = ledger.registry.get(schemaId)?.name ?? schemaId;

  const dateChip = occurredStart ? (
    <span className={`cand-date${!dateEdited && record.timeBasis === "ai-inferred" ? " is-inferred" : ""}`}>
      <CalendarDays size={11} aria-hidden="true" />
      {dateLabel(occurredStart)}
      {dateEdited
        ? " · 직접 지정"
        : record.timeBasis === "ai-inferred"
          ? ` · "${item.dateEvidence ?? "문맥"}"에서 추정`
          : null}
    </span>
  ) : (
    <span className="cand-date is-unknown">
      <CalendarDays size={11} aria-hidden="true" />
      {schemaId === "task" ? "예정일 없음" : "날짜 없음"}
    </span>
  );

  return (
    <article className={`cand-card${excluded ? " is-excluded" : ""}${item.decision === "confirm" ? " is-confirm" : ""}`}>
      <div className="cand-line">
        <span className={`cand-decision cand-decision-${item.decision}`}>
          {item.decision === "confirm" ? "확인 필요" : item.decision === "provisional" ? "잠정" : "바로 저장"}
        </span>
        <span className="cand-kind">{schemaName}</span>
        <span className="cand-title" title={title}>
          {title}
        </span>
        {dateChip}
        <span className="cand-line-actions">
          <button
            type="button"
            className="cand-action"
            disabled={disabled}
            onClick={onToggleExclude}
          >
            {excluded ? "포함" : "제외"}
          </button>
          <button
            type="button"
            className="cand-action"
            aria-expanded={expanded}
            aria-label={expanded ? "접기" : "펼치기"}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
          </button>
        </span>
      </div>

      {expanded && !excluded ? (
        <div className="cand-body">
          <label className="cand-field">
            <span>유형</span>
            <select
              value={schemaId}
              disabled={disabled}
              onChange={(event) => onEdit({ schemaId: event.target.value })}
            >
              {ledger.registry
                .list()
                .filter((schema) => schema.layer === "occurrence" || schema.layer === "distilled")
                .map((schema) => (
                  <option key={schema.id} value={schema.id}>
                    {schema.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="cand-field cand-field-grow">
            <span>제목</span>
            <input
              type="text"
              value={title}
              disabled={disabled}
              onChange={(event) => onEdit({ title: event.target.value })}
            />
          </label>
          <label className="cand-field">
            <span>날짜</span>
            <span className="cand-field-date">
              <input
                type="date"
                value={occurredStart ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  onEdit({ occurredStart: event.target.value ? event.target.value : null })
                }
              />
              {occurredStart ? (
                <button
                  type="button"
                  className="cand-action"
                  disabled={disabled}
                  onClick={() => onEdit({ occurredStart: null })}
                >
                  없음
                </button>
              ) : null}
            </span>
          </label>
          {ledger.contexts.length > 0 ? (
            <label className="cand-field">
              <span>프로젝트</span>
              <select
                value={contextId}
                disabled={disabled}
                onChange={(event) =>
                  onEdit({ contextIds: event.target.value ? [event.target.value] : [] })
                }
              >
                <option value="">없음</option>
                {ledger.contexts.map((context) => (
                  <option key={context.id} value={context.id}>
                    {context.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="cand-rationale">
            {item.rationale}
            {item.decision !== "auto" ? ` · ${item.reason}` : null}
          </p>
        </div>
      ) : null}
    </article>
  );
}

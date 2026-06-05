import { Check, ChevronRight, Edit3, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { eventTypeLabels } from "../../domain/constants";
import type { TimelineEvent } from "../../domain/types";
import { formatTime } from "../../lib/formatting/time";
import type { ReviewEventEdits, ReviewEventItem, ReviewItemStatus } from "../../lib/review";

const STATUS_LABEL: Record<ReviewItemStatus, string> = {
  pending: "대기",
  accepted: "포함",
  discarded: "폐기",
};

/**
 * One extracted event as a compact, scannable row: time · title · status, on a
 * single line. Click to expand the summary and the accept / discard / edit
 * actions. A long import (hundreds of events) reads as a dense list instead of
 * a wall of tall cards. A quiet dot marks a hand-edited item.
 */
export function ExtractedEventCard({
  item,
  onAccept,
  onDiscard,
  onEdit,
}: {
  item: ReviewEventItem;
  onAccept: () => void;
  onDiscard: () => void;
  onEdit: (edits: ReviewEventEdits) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const merged = mergeEvent(item.event, item.edits);
  const isAccepted = item.status === "accepted";
  const isDiscarded = item.status === "discarded";

  return (
    <article
      className={`review-event-row status-${item.status} ${expanded ? "is-open" : ""}`}
      aria-current={isAccepted ? "true" : undefined}
    >
      <button
        type="button"
        className="review-event-row-head"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <ChevronRight size={13} aria-hidden="true" className="review-event-row-caret" />
        <span className="review-event-row-time">{formatTime(merged.start)}</span>
        <span className="review-event-row-title">{merged.title}</span>
        {item.edits ? (
          <span className="review-event-row-edited" title="직접 수정함" aria-label="직접 수정함" />
        ) : null}
        <span className={`review-event-row-status status-${item.status}`}>
          {STATUS_LABEL[item.status]}
        </span>
      </button>

      {expanded ? (
        <div className="review-event-row-body">
          <p className="review-event-card-summary">{merged.summary || "(요약 없음)"}</p>

          {editing ? (
            <EditForm
              event={merged}
              onSave={(edits) => {
                onEdit(edits);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : null}

          <footer className="review-event-card-actions">
            {isDiscarded ? (
              <Button variant="secondary" icon={RotateCcw} onClick={onAccept} title="다시 포함합니다.">
                되돌리기
              </Button>
            ) : (
              <>
                <Button
                  icon={Edit3}
                  onClick={() => setEditing((value) => !value)}
                  size="sm"
                  title="제목 / 요약 / 유형 수정"
                >
                  편집
                </Button>
                <Button
                  icon={Trash2}
                  onClick={onDiscard}
                  size="sm"
                  title="이 이벤트를 반영에서 제외합니다."
                >
                  폐기
                </Button>
                <Button
                  variant={isAccepted ? "secondary" : "primary"}
                  icon={Check}
                  onClick={onAccept}
                  disabled={isAccepted}
                  size="sm"
                  title={isAccepted ? "포함됨" : "반영 시점에 이 이벤트를 세션에 추가합니다."}
                >
                  {isAccepted ? "포함됨" : "수락"}
                </Button>
              </>
            )}
          </footer>
        </div>
      ) : null}
    </article>
  );
}

function EditForm({
  event,
  onSave,
  onCancel,
}: {
  event: TimelineEvent;
  onSave: (edits: ReviewEventEdits) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [summary, setSummary] = useState(event.summary);
  const [type, setType] = useState<TimelineEvent["type"]>(event.type);

  return (
    <div className="review-event-card-edit" role="group" aria-label="이벤트 편집">
      <label>
        제목
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        요약
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
        />
      </label>
      <label>
        유형
        <select value={type} onChange={(e) => setType(e.target.value as TimelineEvent["type"])}>
          {Object.entries(eventTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="review-event-card-edit-actions">
        <Button
          variant="primary"
          onClick={() => onSave({ title, summary, type })}
        >
          저장
        </Button>
        <Button onClick={onCancel}>취소</Button>
      </div>
    </div>
  );
}

function mergeEvent(event: TimelineEvent, edits: ReviewEventItem["edits"]): TimelineEvent {
  if (!edits) return event;
  const next = { ...event };
  if (edits.title?.trim()) next.title = edits.title.trim();
  if (edits.summary?.trim()) next.summary = edits.summary.trim();
  if (edits.type) next.type = edits.type;
  return next;
}

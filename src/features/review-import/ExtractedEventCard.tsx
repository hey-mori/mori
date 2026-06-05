import { Check, Edit3, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { eventTypeLabels } from "../../domain/constants";
import type { TimelineEvent } from "../../domain/types";
import { formatTime } from "../../lib/formatting/time";
import type { ReviewEventEdits, ReviewEventItem } from "../../lib/review";

/**
 * One extracted event, pared down to what the reviewer actually decides on:
 * when it happened, its title, a short summary, and accept / discard / edit.
 *
 * The old card also carried a type badge, a status badge, an "edited" badge,
 * and a four-cell trust / confidence / source-link / author table. That is
 * internal bookkeeping, not a decision the user makes here, so it is gone. The
 * accept / discard state now reads from the card's own tint, and a quiet dot
 * marks a hand-edited item.
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
  const [editing, setEditing] = useState(false);
  const merged = mergeEvent(item.event, item.edits);
  const isAccepted = item.status === "accepted";
  const isDiscarded = item.status === "discarded";

  return (
    <article
      className={`review-event-card status-${item.status} ${editing ? "is-editing" : ""}`}
      aria-current={isAccepted ? "true" : undefined}
    >
      <div className="review-event-card-head">
        <span className="review-event-card-time">{formatTime(merged.start)}</span>
        <strong className="review-event-card-title">{merged.title}</strong>
        {item.edits ? (
          <span className="review-event-card-edited" title="직접 수정함" aria-label="직접 수정함" />
        ) : null}
      </div>

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
          <Button
            variant="secondary"
            icon={RotateCcw}
            onClick={onAccept}
            title="다시 포함합니다."
          >
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

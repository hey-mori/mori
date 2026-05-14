import { Check, Edit3, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { eventTypeLabels } from "../../domain/constants";
import type { TimelineEvent } from "../../domain/types";
import { formatTime } from "../../lib/formatting/time";
import type { ReviewEventEdits, ReviewEventItem } from "../../lib/review";

const STATUS_TONE: Record<ReviewEventItem["status"], "green" | "red" | "gray"> = {
  accepted: "green",
  discarded: "red",
  pending: "gray",
};

const STATUS_LABEL: Record<ReviewEventItem["status"], string> = {
  accepted: "Accepted",
  discarded: "Discarded",
  pending: "Pending",
};

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
  const confidencePct = Math.round(merged.confidence * 100);
  const isAccepted = item.status === "accepted";
  const isDiscarded = item.status === "discarded";

  return (
    <article
      className={`review-event-card status-${item.status} ${editing ? "is-editing" : ""}`}
      aria-current={isAccepted ? "true" : undefined}
    >
      <header className="review-event-card-head">
        <div className="review-event-card-titles">
          <span className="review-event-card-time">{formatTime(merged.start)}</span>
          <strong>{merged.title}</strong>
        </div>
        <div className="review-event-card-badges">
          <Badge tone="purple">{eventTypeLabels[merged.type] ?? merged.type}</Badge>
          <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
          {item.edits ? <Badge tone="orange">Edited</Badge> : null}
        </div>
      </header>

      <p className="review-event-card-summary">{merged.summary || "(요약 없음)"}</p>

      <dl className="review-event-card-meta">
        <div>
          <dt>Trust</dt>
          <dd className={`trust-${merged.trustLevel}`}>{merged.trustLevel}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{confidencePct}%</dd>
        </div>
        <div>
          <dt>Source link</dt>
          <dd>{merged.sourceRefs.length} ref</dd>
        </div>
        <div>
          <dt>Created by</dt>
          <dd>{merged.createdBy}</dd>
        </div>
      </dl>

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
        <Button
          variant={isAccepted ? "primary" : "secondary"}
          icon={Check}
          onClick={onAccept}
          disabled={isAccepted}
          title={isAccepted ? "이미 Accept된 항목입니다." : "이 이벤트를 Apply 시점에 세션에 추가"}
        >
          Accept
        </Button>
        <Button
          icon={Trash2}
          onClick={onDiscard}
          disabled={isDiscarded}
          title={isDiscarded ? "이미 Discard된 항목입니다." : "이 이벤트는 적용에서 제외"}
        >
          Discard
        </Button>
        <Button
          icon={Edit3}
          onClick={() => setEditing((value) => !value)}
          title="제목 / 요약 / 유형 수정"
        >
          Edit
        </Button>
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

/**
 * 흐름 · a project's history by day: the sessions that ran and the records
 * made each day, newest first, with quiet stretches said once. Read-only; a
 * row opens its session or record. See `lib/project/projectChronology.ts` for
 * what is and is not claimed.
 */
import { useState } from "react";
import { Radio } from "lucide-react";
import { InfoHint } from "../../components/ui/InfoHint";
import type { ChronologyItem, ChronologySession, ProjectChronology } from "../../lib/project/projectChronology";
import { readableAgentText } from "../../lib/session/agentText";
import { kindColorClass } from "./recordPresentation";

/** Days shown before the rest fold behind a disclosure. */
const DAYS_SHOWN = 7;

const RECORD_KIND: Record<string, string> = {
  note: "노트",
  decision: "결정",
  task: "할 일",
  insight: "인사이트",
  knowledge: "지식",
  "source-document": "자료",
  qa: "질문",
  event: "일정",
};

export function ProjectChronologySection({
  chronology,
  scope,
  leftOut,
  onOpenSession,
  onOpenRecord,
}: {
  chronology: ProjectChronology;
  /** `project`: confirmed sessions of a project. `folder`: sessions grouped by folder. */
  scope: "project" | "folder";
  /** Sessions in the group not counted here (suggested, not yet confirmed). */
  leftOut: number;
  onOpenSession: (sessionId: string) => void;
  onOpenRecord: (recordId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (chronology.days.length === 0 && chronology.undated.length === 0) return null;
  const days = showAll ? chronology.days : chronology.days.slice(0, DAYS_SHOWN);
  const hidden = chronology.days.length - days.length;
  const summary = [
    chronology.span ? spanLabel(chronology.span.first, chronology.span.last) : null,
    chronology.sessions > 0 ? `세션 ${chronology.sessions}` : null,
    chronology.records > 0 ? `기록 ${chronology.records}` : null,
    leftOut > 0 ? `확정 전 ${leftOut}개 제외` : null,
  ].filter(Boolean);

  return (
    <section className="ctx-section project-chrono" aria-label="흐름">
      <p className="ctx-section-label">
        흐름
        <InfoHint label="흐름 설명">
          {scope === "project" ? "확정된 세션과 이 프로젝트의 기록을" : "이 폴더의 세션과 기록을"} 날짜별로
          모았습니다. 세션은 대화 파일에 남은 마지막 활동의 날짜에 놓이고, 여러 날에 걸친 세션은 시작한 날을 함께
          적습니다. 그 사이 어느 날 무엇을 했는지는 여기서 알 수 없습니다. PR은 대화에 등장한 것이며 만들거나
          병합했다는 뜻이 아닙니다.
        </InfoHint>
      </p>
      {summary.length > 0 ? <p className="project-chrono-summary">{summary.join(" · ")}</p> : null}
      {days.map((day, index) => (
        <div key={day.date} className="project-chrono-day">
          {index > 0 && day.quietDaysAfter > 0 ? (
            <p className="project-chrono-quiet">{day.quietDaysAfter}일 동안 활동 없음</p>
          ) : null}
          <p className="project-chrono-date">{dayLabel(day.date)}</p>
          <ul className="project-chrono-items">
            {day.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <ChronologyRow item={item} onOpenSession={onOpenSession} onOpenRecord={onOpenRecord} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {hidden > 0 ? (
        <button type="button" className="project-chrono-more" onClick={() => setShowAll(true)}>
          이전 {hidden}일 더 보기
        </button>
      ) : null}
      {chronology.undated.length > 0 ? (
        <details className="project-chrono-undated">
          <summary>시간이 없는 항목 {chronology.undated.length}개</summary>
          <ul className="project-chrono-items">
            {chronology.undated.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <ChronologyRow item={item} onOpenSession={onOpenSession} onOpenRecord={onOpenRecord} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function ChronologyRow({
  item,
  onOpenSession,
  onOpenRecord,
}: {
  item: ChronologyItem;
  onOpenSession: (sessionId: string) => void;
  onOpenRecord: (recordId: string) => void;
}) {
  if (item.kind === "record") {
    return (
      <button type="button" className="project-chrono-row" onClick={() => onOpenRecord(item.id)}>
        <span className="project-chrono-time">{item.at ? clock(item.at) : ""}</span>
        <span className={`note-item-dot ${kindColorClass(item.schemaId)}`} aria-hidden="true" />
        <span className="project-chrono-title">{item.title || "제목 없음"}</span>
        <span className="project-chrono-meta">{RECORD_KIND[item.schemaId] ?? "기록"}</span>
      </button>
    );
  }
  return (
    <button type="button" className="project-chrono-row" onClick={() => onOpenSession(item.id)}>
      <span className="project-chrono-time">{item.start ? sessionTime(item) : ""}</span>
      <span className="project-chrono-icon" aria-hidden="true">
        <Radio size={11} />
      </span>
      <span className="project-chrono-title">{readableAgentText(item.title) || "제목 없음"}</span>
      <span className="project-chrono-meta">{sessionMeta(item)}</span>
    </button>
  );
}

function sessionTime(item: ChronologySession): string {
  if (!item.end) return clock(item.start);
  // Across days the start clock would read as the same day: show the last
  // activity, and the start day in the meta.
  if (item.days > 1) return clock(item.end);
  return clock(item.start) === clock(item.end) ? clock(item.start) : `${clock(item.start)}–${clock(item.end)}`;
}

function sessionMeta(item: ChronologySession): string {
  const parts: string[] = [];
  if (item.days > 1) parts.push(`${shortDate(item.start)} 시작`);
  else if (item.minutes !== null && item.minutes > 0) parts.push(duration(item.minutes));
  if (item.messages !== null) parts.push(`메시지 ${item.messages.toLocaleString("ko-KR")}`);
  if (item.prs.length > 0) {
    const shown = item.prs.slice(0, 3).map((pr) => `#${pr.number}`).join(" ");
    parts.push(`PR ${shown}${item.prs.length > 3 ? ` 외 ${item.prs.length - 3}개` : ""}`);
  }
  return parts.join(" · ");
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

function clock(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  return `${m}월 ${d}일 (${WEEKDAY[date.getDay()]})`;
}

function spanLabel(first: string, last: string): string {
  const a = new Date(first);
  const b = new Date(last);
  const label = (date: Date) => `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return label(a) === label(b) ? label(a) : `${label(a)} – ${label(b)}`;
}

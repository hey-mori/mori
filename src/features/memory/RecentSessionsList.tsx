import { Archive, ChevronRight, HardDrive, Layers, Play } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { DerivedSession } from "../../lib/project-memory/projectMemory";
import type { ProjectMemoryLoadedSessionStatus } from "../../lib/project-memory/projectMemoryModel";
import { formatDate } from "../../lib/formatting/time";

const SCOPE_TONE: Record<string, "green" | "purple" | "blue" | "gray"> = {
  "current-session": "green",
  "browser-draft": "blue",
  "sqlite-saved": "purple",
  demo: "gray",
};

const LOAD_TONE: Record<ProjectMemoryLoadedSessionStatus, "green" | "orange" | "red"> = {
  loaded: "green",
  metadataOnly: "orange",
  failed: "red",
};

const LOAD_LABEL: Record<ProjectMemoryLoadedSessionStatus, string> = {
  loaded: "본문 로드됨",
  metadataOnly: "메타데이터만",
  failed: "로드 실패",
};

export function RecentSessionsList({
  sessions,
  loadStatusBySessionId,
  onOpenSession,
  onStartNewSession,
}: {
  sessions: DerivedSession[];
  /** Optional per-session load outcome keyed by sessionId. */
  loadStatusBySessionId?: Record<string, ProjectMemoryLoadedSessionStatus>;
  /** Called for sessions we can actually open (current or SQLite). Browser drafts pass through but the action is informational. */
  onOpenSession?: (entry: DerivedSession) => void;
  onStartNewSession: () => void;
}) {
  return (
    <section className="memory-sessions" aria-label="Recent sessions">
      <header className="memory-section-head">
        <div>
          <h3>최근 세션</h3>
          <p>현재 세션 + 저장된 browser draft + Desktop SQLite 세션을 한곳에서 보여줍니다.</p>
        </div>
        <Button variant="ghost" icon={Play} onClick={onStartNewSession} title="대부분의 세션은 가져오기에서 시작됩니다. 새 세션은 드문 경우입니다.">
          새 세션
        </Button>
      </header>
      {sessions.length === 0 ? (
        <p className="memory-empty">아직 저장된 세션이 없습니다. 연결에서 가져오거나 새 세션을 만들면 여기 목록이 채워집니다.</p>
      ) : (
        <ul className="memory-session-list">
          {sessions.map((entry) => (
            <li key={`${entry.scope}-${entry.sessionId}`}>
              <button
                type="button"
                className={`memory-session-row ${entry.isCurrent ? "is-current" : ""}`}
                onClick={() => onOpenSession?.(entry)}
                aria-current={entry.isCurrent ? "true" : undefined}
              >
                <span className="memory-session-icon">
                  {entry.scope === "sqlite-saved" ? (
                    <HardDrive size={14} aria-hidden="true" />
                  ) : entry.scope === "browser-draft" ? (
                    <Archive size={14} aria-hidden="true" />
                  ) : (
                    <Layers size={14} aria-hidden="true" />
                  )}
                </span>
                <div className="memory-session-titles">
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.projectName ?? "(프로젝트 없음)"}
                    {entry.savedAt ? ` · 저장 ${formatShort(entry.savedAt)}` : entry.startedAt ? ` · 시작 ${formatShort(entry.startedAt)}` : ""}
                  </span>
                </div>
                <div className="memory-session-meta">
                  <Badge tone={SCOPE_TONE[entry.scope] ?? "gray"}>{entry.scopeLabel}</Badge>
                  {loadStatusBySessionId?.[entry.sessionId] && entry.scope !== "current-session" ? (
                    <Badge tone={LOAD_TONE[loadStatusBySessionId[entry.sessionId]]}>
                      {LOAD_LABEL[loadStatusBySessionId[entry.sessionId]]}
                    </Badge>
                  ) : null}
                  {entry.eventCount !== null ? <span>이벤트 {entry.eventCount}건</span> : null}
                  {entry.sourceCount !== null ? <span>출처 {entry.sourceCount}건</span> : null}
                </div>
                <ChevronRight size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatShort(iso: string): string {
  try {
    return formatDate(iso);
  } catch {
    return iso;
  }
}

import { History, Layers, ShieldAlert } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { BaseSection } from "../../components/ui/BaseSection";
import {
  getReimportStatusTone,
  type ProjectMemoryReimportSummary,
} from "../../lib/project-memory/projectMemoryModel";

const STATUS_LABEL: Record<string, string> = {
  new: "새 import",
  partialReimport: "부분 재import",
  duplicateOnly: "중복만",
  historyUnavailable: "기록 없음",
  invalidOnly: "유효하지 않음",
  unknown: "기타",
};

/**
 * Project-level re-import history. Mirrors the per-source preview card on
 * Evidence Hub but rolls counts up across every saved session that
 * persisted a `ConnectorSourceImportSummary`. Sessions that never went
 * through the connector pipeline (or that pre-date `connectorEventId`)
 * contribute nothing — the empty state surfaces that honestly.
 */
export function ReimportHistoryCard({
  summary,
}: {
  summary: ProjectMemoryReimportSummary;
}) {
  const hasData = summary.totalReimports > 0;
  return (
    <BaseSection
      className="memory-reimport"
      ariaLabel="Connector 재가져오기 기록"
      title={
        <span className="memory-reimport-title">
          <History size={14} aria-hidden="true" /> 이번 프로젝트 재import
        </span>
      }
      hint={
        <span>
          저장된 세션의 connector import 결과를 집계합니다. 로컬-only이며 외부 계정/폴더는 스캔하지 않습니다.
        </span>
      }
    >
      {!hasData ? (
        <p className="memory-empty">
          아직 재가져오기 기록이 없습니다. 소스에서 connector JSONL을 가져오면 여기 누적됩니다.
        </p>
      ) : (
        <>
          <dl className="memory-reimport-counts">
            <CountTile label={STATUS_LABEL.new} value={summary.newImportCount} tone="green" />
            <CountTile
              label={STATUS_LABEL.partialReimport}
              value={summary.partialReimportCount}
              tone="blue"
            />
            <CountTile
              label={STATUS_LABEL.duplicateOnly}
              value={summary.duplicateOnlyCount}
              tone="orange"
            />
            <CountTile
              label={STATUS_LABEL.historyUnavailable}
              value={summary.historyUnavailableCount}
              tone="gray"
            />
            <CountTile
              label={STATUS_LABEL.invalidOnly}
              value={summary.invalidOnlyCount}
              tone="red"
            />
          </dl>

          {summary.topMatchedSavedSessions.length > 0 ? (
            <section className="memory-reimport-matched">
              <header>
                <Layers size={12} aria-hidden="true" /> 매칭된 저장 세션
              </header>
              <ul>
                {summary.topMatchedSavedSessions.map((match) => (
                  <li key={match.sessionId}>
                    <strong title={match.title ?? match.sessionId}>{match.title ?? match.sessionId}</strong>
                    <small>{match.reimportCount}건 재import</small>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {summary.recentItems.length > 0 ? (
            <section className="memory-reimport-items">
              <header>
                <ShieldAlert size={12} aria-hidden="true" /> 최근 재import
              </header>
              <ul>
                {summary.recentItems.map((item) => (
                  <li key={item.importId}>
                    <div className="memory-reimport-item-head">
                      <strong title={item.sourceTitle}>{item.sourceTitle}</strong>
                      <Badge tone={getReimportStatusTone(item.status)}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </Badge>
                    </div>
                    <div className="memory-reimport-item-meta">
                      <span>새 {item.newEventCount}</span>
                      <span>중복 {item.duplicateEventCount}</span>
                      {item.invalidLineCount > 0 ? <span>오류 {item.invalidLineCount}</span> : null}
                      {item.sessionTitle ? <span>· {item.sessionTitle}</span> : null}
                      {!item.savedSessionHistoryAvailable ? (
                        <span className="memory-reimport-honesty">저장 세션 기록 없이 import됨</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </BaseSection>
  );
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "blue" | "orange" | "red" | "gray";
}) {
  return (
    <div className={`memory-reimport-count tone-${tone}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

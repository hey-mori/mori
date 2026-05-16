import { CalendarClock, Lock, MapPin, ShieldCheck } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { MoriTrustBadge } from "../../components/ui/MoriTrustBadge";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { eventTypeLabels } from "../../domain/constants";
import type { MoriMockSession } from "../../domain/types";
import { getEventEvidenceSources, getSourceDisplayStatus } from "../../lib/sources/traceability";
import type { SourceIntegration } from "../../lib/sources/sourceRegistry";
import {
  getCaptureMethodLabel,
  getIntegrationStatusLabel,
  getRawDataPolicyLabel,
} from "../../lib/evidence/provenance";
import { getTrustDisplay } from "../../lib/evidence/trust";
import {
  getProductAvailabilityTone,
  productAvailabilityFromIntegrationStatus,
} from "../../lib/product-state/productState";
import {
  describeConnectorSourceImportBadge,
  getConnectorSourceImportBadgeTone,
  type ConnectorSourceImportSummary,
} from "../../lib/connectors";

export type EvidenceDetailSelection =
  | { kind: "source"; sourceId: string }
  | { kind: "integration"; integrationId: string }
  | { kind: "empty" };

export function SourceDetailPanel({
  selection,
  view,
  integrationLookup,
  importSummary,
}: {
  selection: EvidenceDetailSelection;
  view: MoriMockSession;
  integrationLookup: Map<string, SourceIntegration>;
  /** Optional re-import summary for the selected source (connector imports only). */
  importSummary?: ConnectorSourceImportSummary;
}) {
  if (selection.kind === "empty") {
    return (
      <aside className="evidence-detail" aria-label="Source detail">
        <header className="evidence-detail-header">
          <Badge tone="gray">선택된 항목 없음</Badge>
          <h3>근거 상세</h3>
          <p>왼쪽에서 소스 카드를 선택하면 출처, 신뢰도, 원본 보존 정책이 여기 표시됩니다.</p>
        </header>
        <section className="evidence-detail-section">
          <SectionHeader title="Mori가 약속하는 것" />
          <ul className="evidence-detail-pledges">
            <li>
              <ShieldCheck size={14} /> 명시적으로 추가한 소스만 사용합니다.
            </li>
            <li>
              <Lock size={14} /> 백그라운드 캡처, 브라우저 스캐닝, 자동 계정 연결은 없습니다.
            </li>
            <li>
              <MapPin size={14} /> 모든 분석/리포트는 가져온 소스에 직접 연결됩니다.
            </li>
          </ul>
        </section>
      </aside>
    );
  }

  if (selection.kind === "source") {
    return (
      <SourceDetailView
        selection={selection}
        view={view}
        integrationLookup={integrationLookup}
        importSummary={importSummary}
      />
    );
  }

  return <IntegrationDetailView selection={selection} integrationLookup={integrationLookup} />;
}

function SourceDetailView({
  selection,
  view,
  integrationLookup,
  importSummary,
}: {
  selection: { kind: "source"; sourceId: string };
  view: MoriMockSession;
  integrationLookup: Map<string, SourceIntegration>;
  importSummary?: ConnectorSourceImportSummary;
}) {
  const source = view.sources.find((entry) => entry.id === selection.sourceId);
  if (!source) {
    return (
      <aside className="evidence-detail" aria-label="Source detail">
        <header className="evidence-detail-header">
          <Badge tone="gray">선택된 소스를 찾을 수 없음</Badge>
          <p>이 세션에는 이 ID에 해당하는 소스가 더 이상 없습니다.</p>
        </header>
      </aside>
    );
  }

  const display = getSourceDisplayStatus(source);
  const integration = integrationLookup.get(source.kind);
  const relatedEvents = view.events.filter((event) => event.sourceRefs.includes(source.id));

  return (
    <aside className="evidence-detail" aria-label="Source detail">
      <header className="evidence-detail-header">
        <div className="evidence-detail-badges">
          <MoriTrustBadge level={source.trustLevel} />
          <MoriStatusBadge
            tone={getProductAvailabilityTone(
              productAvailabilityFromIntegrationStatus(display.status),
            )}
          >
            {display.statusLabel}
          </MoriStatusBadge>
          <Badge tone="purple">{display.integrationLabel}</Badge>
        </div>
        <h3>{source.title}</h3>
        <p className="evidence-detail-detail">{source.detail}</p>
      </header>

      <section className="evidence-detail-section">
        <SectionHeader title="출처 및 캡처" />
        <dl className="evidence-detail-grid">
          <div>
            <dt>통합</dt>
            <dd>{display.integrationLabel}</dd>
          </div>
          <div>
            <dt>캡처 방식</dt>
            <dd>{display.captureMethod}</dd>
          </div>
          <div>
            <dt>원본 데이터 정책</dt>
            <dd>{display.rawDataLabel}</dd>
          </div>
          <div>
            <dt>
              <CalendarClock size={11} /> 가져온 시각
            </dt>
            <dd>{formatTime(source.capturedAt)}</dd>
          </div>
          {source.uri ? (
            <div>
              <dt>URI / 출처</dt>
              <dd className="evidence-detail-uri">{source.uri}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {importSummary && importSummary.status !== "unknown" ? (
        <section className="evidence-detail-section">
          <SectionHeader title="재import 상태" />
          <div className="evidence-detail-reimport">
            <Badge tone={getConnectorSourceImportBadgeTone(importSummary)}>
              {describeConnectorSourceImportBadge(importSummary)}
            </Badge>
            <p className="evidence-detail-reimport-detail">{importSummary.detailMessage}</p>
            <ul className="evidence-detail-reimport-counts">
              <li>새 이벤트 <strong>{importSummary.newEventCount}</strong></li>
              <li>현재 세션 중복 <strong>{importSummary.currentSessionDuplicateCount}</strong></li>
              <li>저장 세션 중복 <strong>{importSummary.savedSessionDuplicateCount}</strong></li>
              <li>파일 내부 중복 <strong>{importSummary.inBatchDuplicateCount}</strong></li>
              <li>잘못된 라인 <strong>{importSummary.invalidLineCount}</strong></li>
            </ul>
            {importSummary.matchedSavedSessions.length > 0 ? (
              <p className="evidence-detail-reimport-matched">
                매칭된 저장 세션:{" "}
                {importSummary.matchedSavedSessions
                  .map((entry) => entry.title ?? entry.sessionId)
                  .slice(0, 3)
                  .join(", ")}
                {importSummary.matchedSavedSessions.length > 3
                  ? ` 외 ${importSummary.matchedSavedSessions.length - 3}건`
                  : ""}
              </p>
            ) : null}
            <p className="evidence-detail-reimport-privacy muted">
              Mori 는 로컬에 저장된 Mori 세션만 기준으로 재import 를 판단합니다.
              connectorEventId 가 없는 옛 import 는 소급 검사되지 않습니다.
            </p>
          </div>
        </section>
      ) : null}

      <section className="evidence-detail-section">
        <SectionHeader
          title="연결된 타임라인 이벤트"
          hint={`${relatedEvents.length}개 이벤트`}
        />
        {relatedEvents.length === 0 ? (
          <p className="evidence-detail-empty">아직 연결된 이벤트가 없습니다.</p>
        ) : (
          <ul className="evidence-detail-events">
            {relatedEvents.slice(0, 6).map((event) => (
              <li key={event.id}>
                <Badge tone="purple">{eventTypeLabels[event.type] ?? event.type}</Badge>
                <strong title={event.title}>{event.title}</strong>
                <span className="evidence-detail-event-summary">{event.summary}</span>
              </li>
            ))}
            {relatedEvents.length > 6 ? (
              <li className="evidence-detail-more">+ {relatedEvents.length - 6}건 더</li>
            ) : null}
          </ul>
        )}
      </section>

      <section className="evidence-detail-section">
        <SectionHeader title="개인정보 정책" />
        <p className="evidence-detail-privacy">
          <Lock size={12} aria-hidden="true" />
          <span>{display.privacyNote}</span>
        </p>
        {integration ? (
          <p className="evidence-detail-pledge muted">
            Mori가 이 소스에 추가로 접근하는 일은 없습니다. 다음 캡처는 사용자가 직접 시작할 때만 일어납니다.
          </p>
        ) : null}
      </section>

      <RelatedRecordsSection sourceId={source.id} view={view} relatedEvents={relatedEvents} />
    </aside>
  );
}

function IntegrationDetailView({
  selection,
  integrationLookup,
}: {
  selection: { kind: "integration"; integrationId: string };
  integrationLookup: Map<string, SourceIntegration>;
}) {
  const integration = integrationLookup.get(selection.integrationId);
  if (!integration) {
    return (
      <aside className="evidence-detail" aria-label="Integration detail">
        <header className="evidence-detail-header">
          <Badge tone="gray">알 수 없는 통합</Badge>
          <p>이 ID에 해당하는 소스 통합 정의가 없습니다.</p>
        </header>
      </aside>
    );
  }

  const accessible = describeAccessible(integration);
  const inaccessible = describeInaccessible(integration);

  return (
    <aside className="evidence-detail" aria-label="Integration detail">
      <header className="evidence-detail-header">
        <div className="evidence-detail-badges">
          <MoriStatusBadge
            tone={getProductAvailabilityTone(
              productAvailabilityFromIntegrationStatus(integration.status),
            )}
          >
            {getIntegrationStatusLabel(integration.status)}
          </MoriStatusBadge>
          <Badge tone="purple">{integration.id}</Badge>
        </div>
        <h3>{integration.label}</h3>
        <p className="evidence-detail-detail">{integration.description}</p>
      </header>

      <section className="evidence-detail-section">
        <SectionHeader title="현재 상태" />
        <dl className="evidence-detail-grid">
          <div>
            <dt>상태</dt>
            <dd>{getIntegrationStatusLabel(integration.status)}</dd>
          </div>
          <div>
            <dt>캡처 방식</dt>
            <dd>{getCaptureMethodLabel(integration.captureMode)}</dd>
          </div>
          <div>
            <dt>원본 데이터 정책</dt>
            <dd>{getRawDataPolicyLabel(integration.rawDataPolicy)}</dd>
          </div>
          <div>
            <dt>기본 신뢰도</dt>
            <dd className={`trust-${integration.trustDefault}`}>
              {getTrustDisplay(integration.trustDefault).label}
            </dd>
          </div>
        </dl>
      </section>

      <section className="evidence-detail-section">
        <SectionHeader title="Mori가 접근하는 것" />
        <ul className="evidence-detail-bullets">
          {accessible.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="evidence-detail-section">
        <SectionHeader title="Mori가 접근하지 않는 것" />
        <ul className="evidence-detail-bullets muted">
          {inaccessible.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="evidence-detail-section">
        <SectionHeader title="개인정보 정책" />
        <p className="evidence-detail-privacy">
          <Lock size={12} aria-hidden="true" />
          <span>{integration.privacyNote}</span>
        </p>
      </section>
    </aside>
  );
}

function RelatedRecordsSection({
  sourceId,
  view,
  relatedEvents,
}: {
  sourceId: string;
  view: MoriMockSession;
  relatedEvents: ReturnType<typeof getEventEvidenceSources>["sources"] | typeof view.events;
}) {
  const eventIds = new Set(relatedEvents.map((event) => ("id" in event ? event.id : "")));
  const linkedIssues = view.issues.filter((issue) =>
    issue.sourceEventIds.some((id) => eventIds.has(id)),
  );
  const linkedDecisions = view.decisions.filter(
    (decision) =>
      decision.relatedSourceIds.includes(sourceId) ||
      decision.sourceEventIds.some((id) => eventIds.has(id)),
  );

  if (linkedIssues.length === 0 && linkedDecisions.length === 0) return null;

  return (
    <section className="evidence-detail-section">
      <SectionHeader title="이슈 / 결정으로의 연결" />
      <ul className="evidence-detail-links">
        {linkedIssues.length > 0 ? (
          <li>
            <Badge tone="red">이슈</Badge>
            <span>
              {linkedIssues.length}건 · {linkedIssues[0].title}
              {linkedIssues.length > 1 ? ` 외 ${linkedIssues.length - 1}건` : ""}
            </span>
          </li>
        ) : null}
        {linkedDecisions.length > 0 ? (
          <li>
            <Badge tone="green">결정</Badge>
            <span>
              {linkedDecisions.length}건 · {linkedDecisions[0].title}
              {linkedDecisions.length > 1 ? ` 외 ${linkedDecisions.length - 1}건` : ""}
            </span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function describeAccessible(integration: SourceIntegration): string[] {
  if (integration.status === "planned") {
    return ["아직 활성화되지 않았습니다. 설정/연결 단계가 도착하면 가능한 데이터 범위가 여기 표시됩니다."];
  }
  const lines: string[] = [];
  lines.push(`사용자가 명시적으로 ${integration.captureMode === "manual" ? "입력 또는 붙여넣기" : "가져오기"}한 데이터`);
  if (integration.outputRecords.sources) lines.push("정규화된 SourceRef (출처 기록)");
  if (integration.outputRecords.timelineEvents) lines.push("정규화된 Timeline Event");
  if (integration.outputRecords.issues) lines.push("Quick Pass 분석을 통한 이슈 후보");
  if (integration.outputRecords.decisions) lines.push("Quick Pass 분석을 통한 결정 기록");
  if (integration.outputRecords.relationships) lines.push("이벤트/소스 간 관계");
  return lines;
}

function describeInaccessible(integration: SourceIntegration): string[] {
  const lines = [
    "백그라운드 디스크/브라우저/앱 스캔",
    "사용자 동의 없는 자동 캡처",
    "API 키 또는 OAuth 계정 연결",
  ];
  if (integration.rawDataPolicy === "summaryOnly") {
    lines.unshift("전체 원본 텍스트 (요약과 메타데이터만 저장됨)");
  }
  if (integration.rawDataPolicy === "notCaptured") {
    lines.unshift("어떤 원본 데이터도 보관되지 않음 (메타데이터만)");
  }
  return lines;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

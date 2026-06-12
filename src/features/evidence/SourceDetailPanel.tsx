import { CalendarClock } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import {
  BaseInspectorPanel,
  InspectorSection,
  InspectorFields,
  InspectorRows,
  InspectorRow,
  InspectorNote,
  InspectorEmpty,
} from "../../components/ui/BaseInspectorPanel";
import { eventTypeLabels } from "../../domain/constants";
import type { MockSession } from "../../domain/types";
import { getEventEvidenceSources, getSourceDisplayStatus } from "../../lib/sources/traceability";
import { getCaptureFidelityDisplay } from "../../lib/evidence/fidelityDisplay";
import type { SourceIntegration } from "../../lib/sources/sourceRegistry";
import {
  getCaptureMethodLabel,
  getIntegrationStatusLabel,
} from "../../lib/evidence/provenance";
import { getTrustDisplay } from "../../lib/evidence/trust";
import { formatDateTime } from "../../lib/formatting/time";
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
  onClose,
}: {
  selection: EvidenceDetailSelection;
  view: MockSession;
  integrationLookup: Map<string, SourceIntegration>;
  /** Optional re-import summary for the selected source (connector imports only). */
  importSummary?: ConnectorSourceImportSummary;
  /** Close the panel from within (renders the X). */
  onClose?: () => void;
}) {
  if (selection.kind === "empty") return null;

  if (selection.kind === "source") {
    return (
      <SourceDetailView
        selection={selection}
        view={view}
        importSummary={importSummary}
        onClose={onClose}
      />
    );
  }

  return (
    <IntegrationDetailView
      selection={selection}
      integrationLookup={integrationLookup}
      onClose={onClose}
    />
  );
}

function SourceDetailView({
  selection,
  view,
  importSummary,
  onClose,
}: {
  selection: { kind: "source"; sourceId: string };
  view: MockSession;
  importSummary?: ConnectorSourceImportSummary;
  onClose?: () => void;
}) {
  const source = view.sources.find((entry) => entry.id === selection.sourceId);
  if (!source) {
    return (
      <BaseInspectorPanel
        className="evidence-detail"
        ariaLabel="자료 상세"
        onClose={onClose}
        eyebrow={<Badge tone="gray">선택된 소스를 찾을 수 없음</Badge>}
        title="이 소스를 찾을 수 없습니다"
        description="이 세션에는 이 ID에 해당하는 소스가 더 이상 없습니다."
      >
        {null}
      </BaseInspectorPanel>
    );
  }

  const display = getSourceDisplayStatus(source);
  const fidelityDisplay = source.captureFidelity
    ? getCaptureFidelityDisplay(source.captureFidelity)
    : null;
  const relatedEvents = view.events.filter((event) => event.sourceRefs.includes(source.id));

  const captureFields: Array<{ label: ReactNode; value: ReactNode; mono?: boolean }> = [
    { label: "캡처 방식", value: display.captureMethod },
  ];
  if (fidelityDisplay && fidelityDisplay.shouldSurface) {
    captureFields.push({
      label: "캡처 완전성",
      value:
        fidelityDisplay.label +
        (fidelityDisplay.reasonLabels.length > 0
          ? ` · ${fidelityDisplay.reasonLabels.join(", ")}`
          : ""),
    });
  }
  captureFields.push({
    label: (
      <>
        <CalendarClock size={11} /> 가져온 시각
      </>
    ),
    value: formatTime(source.capturedAt),
  });
  if (source.uri) {
    captureFields.push({ label: "URI / 출처", value: source.uri, mono: true });
  }

  return (
    <BaseInspectorPanel
      className="evidence-detail"
      ariaLabel="자료 상세"
      onClose={onClose}
      title={source.title}
      description={source.detail}
    >
      <InspectorSection title="출처 및 캡처">
        <InspectorFields items={captureFields} />
      </InspectorSection>

      {importSummary && importSummary.status !== "unknown" ? (
        <InspectorSection title="재import 상태">
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
          </div>
          <InspectorNote>
            Mori 는 로컬에 저장된 Mori 세션만 기준으로 재import 를 판단합니다.
            connectorEventId 가 없는 옛 import 는 소급 검사되지 않습니다.
          </InspectorNote>
        </InspectorSection>
      ) : null}

      <InspectorSection
        title="연결된 타임라인 이벤트"
        hint={`${relatedEvents.length}개`}
      >
        {relatedEvents.length === 0 ? (
          <InspectorEmpty>아직 연결된 이벤트가 없습니다.</InspectorEmpty>
        ) : (
          <>
            <InspectorRows>
              {relatedEvents.slice(0, 6).map((event) => (
                <InspectorRow
                  key={event.id}
                  leading={<Badge tone="purple">{eventTypeLabels[event.type] ?? event.type}</Badge>}
                  title={event.title}
                  meta={event.summary}
                />
              ))}
            </InspectorRows>
            {relatedEvents.length > 6 ? (
              <InspectorEmpty>+ {relatedEvents.length - 6}건 더</InspectorEmpty>
            ) : null}
          </>
        )}
      </InspectorSection>

      <RelatedRecordsSection sourceId={source.id} view={view} relatedEvents={relatedEvents} />
    </BaseInspectorPanel>
  );
}

function IntegrationDetailView({
  selection,
  integrationLookup,
  onClose,
}: {
  selection: { kind: "integration"; integrationId: string };
  integrationLookup: Map<string, SourceIntegration>;
  onClose?: () => void;
}) {
  const integration = integrationLookup.get(selection.integrationId);
  if (!integration) {
    return (
      <BaseInspectorPanel
        className="evidence-detail"
        ariaLabel="통합 상세"
        onClose={onClose}
        eyebrow={<Badge tone="gray">알 수 없는 통합</Badge>}
        title="이 통합을 찾을 수 없습니다"
        description="이 ID에 해당하는 소스 통합 정의가 없습니다."
      >
        {null}
      </BaseInspectorPanel>
    );
  }

  const accessible = describeAccessible(integration);
  const inaccessible = describeInaccessible(integration);

  return (
    <BaseInspectorPanel
      className="evidence-detail"
      ariaLabel="통합 상세"
      onClose={onClose}
      title={integration.label}
      description={integration.description}
    >
      <InspectorSection title="현재 상태">
        <InspectorFields
          items={[
            { label: "상태", value: getIntegrationStatusLabel(integration.status) },
            { label: "캡처 방식", value: getCaptureMethodLabel(integration.captureMode) },
            {
              label: "기본 신뢰도",
              value: (
                <span className={`trust-${integration.trustDefault}`}>
                  {getTrustDisplay(integration.trustDefault).label}
                </span>
              ),
            },
          ]}
        />
      </InspectorSection>

      <InspectorSection title="사용하는 데이터">
        <ul className="ins-bullets">
          {accessible.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </InspectorSection>

      <InspectorSection title="사용하지 않는 데이터">
        <ul className="ins-bullets is-muted">
          {inaccessible.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </InspectorSection>

    </BaseInspectorPanel>
  );
}

function RelatedRecordsSection({
  sourceId,
  view,
  relatedEvents,
}: {
  sourceId: string;
  view: MockSession;
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
    <InspectorSection title="이슈 / 결정으로의 연결">
      <InspectorRows>
        {linkedIssues.length > 0 ? (
          <InspectorRow
            leading={<Badge tone="red">이슈</Badge>}
            title={linkedIssues[0].title}
            meta={linkedIssues.length > 1 ? `${linkedIssues.length}건` : undefined}
          />
        ) : null}
        {linkedDecisions.length > 0 ? (
          <InspectorRow
            leading={<Badge tone="green">결정</Badge>}
            title={linkedDecisions[0].title}
            meta={linkedDecisions.length > 1 ? `${linkedDecisions.length}건` : undefined}
          />
        ) : null}
      </InspectorRows>
    </InspectorSection>
  );
}

function describeAccessible(integration: SourceIntegration): string[] {
  if (integration.status === "planned") {
    return ["아직 활성화되지 않았습니다. 설정/연결 단계가 도착하면 가능한 데이터 범위가 여기 표시됩니다."];
  }
  const lines: string[] = [];
  lines.push(`사용자가 명시적으로 ${integration.captureMode === "manual" ? "입력 또는 붙여넣기" : "가져오기"}한 데이터`);
  if (integration.outputRecords.sources) lines.push("정리된 출처");
  if (integration.outputRecords.timelineEvents) lines.push("정리된 타임라인 이벤트");
  if (integration.outputRecords.issues) lines.push("분석으로 추출한 이슈");
  if (integration.outputRecords.decisions) lines.push("분석으로 추출한 결정");
  if (integration.outputRecords.relationships) lines.push("이벤트·출처 간 관계");
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
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

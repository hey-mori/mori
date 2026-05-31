import { FileText, Layers, ShieldAlert } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { BaseSection } from "../../components/ui/BaseSection";
import { describeProposalKind } from "../../lib/project-memory/projectMemoryConsolidationState";
import type { ConsolidationReviewEntry } from "../../lib/project-memory/consolidationReviewState";
import type {
  MemoryEvidenceRef,
  MemoryProposal,
} from "../../lib/project-memory/consolidationProposals";
import { IMPORTANCE_LABELS, describeProposedAction } from "./ConsolidationProposalCard";

/**
 * Right-side inspector for the Consolidation Review Surface.
 *
 * Renders the selected proposal's typed `MemoryEvidenceRef[]` and
 * related-session metadata. The panel never copies raw connector
 * content, transcript text, or full local file paths — every
 * reference is a typed pointer with an id and an optional human
 * label.
 *
 * The panel also surfaces the data-basis context (carried by the
 * underlying Consolidation State) and a small local-only notice so
 * the user can always see the privacy boundary.
 */
export function ConsolidationEvidencePanel({
  entry,
  dataBasisLabel,
}: {
  entry: ConsolidationReviewEntry | null;
  dataBasisLabel: string;
}) {
  if (!entry) {
    return (
      <aside className="consolidation-inspector" aria-label="자료 검사기">
        <BaseSection title="자료 / 세션 참조" ariaLabel="자료 검사기 — 비어 있음">
          <p className="consolidation-inspector-empty">
            좌측에서 제안 카드를 선택하면 자료와 출처 세션 참조가 표시됩니다.
          </p>
        </BaseSection>
      </aside>
    );
  }

  const { proposal } = entry;
  const sessionRefs = proposal.evidenceRefs.filter(isSessionRef);
  const eventRefs = proposal.evidenceRefs.filter(isEventRef);
  const sourceRefs = proposal.evidenceRefs.filter(isSourceRef);

  return (
    <aside className="consolidation-inspector" aria-label="자료 검사기">
      <BaseSection
        title="자료 / 세션 참조"
        hint={
          <span>
            현재는 식별자 / 제목만 표시합니다. 세부 자료 deep-link는 별도 capability로 예정되어
            있습니다.
          </span>
        }
        ariaLabel="자료 검사기"
        className="consolidation-inspector-section"
      >
        <header className="consolidation-inspector-head">
          <strong>{proposal.title}</strong>
          <Badge tone="purple">{describeProposalKind(proposal.kind)}</Badge>
        </header>

        <dl className="consolidation-inspector-meta">
          <span>
            <dt>중요도</dt>
            <dd>{IMPORTANCE_LABELS[proposal.importance] ?? proposal.importance}</dd>
          </span>
          <span>
            <dt>신뢰도</dt>
            <dd>{Math.round(proposal.confidence * 100)}%</dd>
          </span>
          <span>
            <dt>제안 액션</dt>
            <dd>{describeProposedAction(proposal.proposedAction)}</dd>
          </span>
          <span>
            <dt>출처 세션 수</dt>
            <dd>{proposal.sourceSessionIds.length}</dd>
          </span>
          <span>
            <dt>자료 참조</dt>
            <dd>{proposal.evidenceRefs.length}</dd>
          </span>
          <span>
            <dt>데이터 기반</dt>
            <dd>{dataBasisLabel}</dd>
          </span>
        </dl>

        {sessionRefs.length > 0 ? (
          <section className="consolidation-inspector-block">
            <h4>
              <Layers size={12} aria-hidden="true" /> 세션 참조 ({sessionRefs.length})
            </h4>
            <ul>
              {sessionRefs.map((ref) => (
                <li key={`session-${ref.sessionId}`}>
                  <strong>{(ref as { sessionTitle?: string }).sessionTitle ?? ref.sessionId}</strong>
                  <small>id: {ref.sessionId}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {eventRefs.length > 0 ? (
          <section className="consolidation-inspector-block">
            <h4>
              <FileText size={12} aria-hidden="true" /> 이벤트 참조 ({eventRefs.length})
            </h4>
            <ul>
              {eventRefs.map((ref) => (
                <li key={`event-${ref.eventId}`}>
                  <strong>{ref.eventId}</strong>
                  <small>세션: {ref.sessionId}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {sourceRefs.length > 0 ? (
          <section className="consolidation-inspector-block">
            <h4>
              <FileText size={12} aria-hidden="true" /> 출처 참조 ({sourceRefs.length})
            </h4>
            <ul>
              {sourceRefs.map((ref) => (
                <li key={`source-${ref.sourceId}`}>
                  <strong>{ref.sourceId}</strong>
                  <small>세션: {ref.sessionId}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {proposal.relatedDecisionIds.length > 0 || proposal.relatedIssueIds.length > 0 ? (
          <section className="consolidation-inspector-block">
            <h4>관련 항목</h4>
            <ul>
              {proposal.relatedDecisionIds.map((id) => (
                <li key={`d-${id}`}>
                  <strong>결정</strong>
                  <small>{id}</small>
                </li>
              ))}
              {proposal.relatedIssueIds.map((id) => (
                <li key={`i-${id}`}>
                  <strong>이슈</strong>
                  <small>{id}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="consolidation-inspector-footer">
          <ShieldAlert size={12} aria-hidden="true" />
          <span>
            로컬에 저장된 Mori 세션만 사용합니다. 클라우드 동기화 / 백그라운드 캡처 / 외부 계정
            접근은 없습니다. 현재 검토 결정은 메모리 반영 전까지 드래프트이며, 반영 후 accepted
            memory와 감사 로그로 로컬에 저장됩니다.
          </span>
        </footer>
      </BaseSection>
    </aside>
  );
}

function isSessionRef(ref: MemoryEvidenceRef): ref is Extract<MemoryEvidenceRef, { kind: "session" }> {
  return ref.kind === "session";
}
function isEventRef(ref: MemoryEvidenceRef): ref is Extract<MemoryEvidenceRef, { kind: "event" }> {
  return ref.kind === "event";
}
function isSourceRef(ref: MemoryEvidenceRef): ref is Extract<MemoryEvidenceRef, { kind: "source" }> {
  return ref.kind === "source";
}

// suppress unused warning for the kind helper signature symmetry
void (null as MemoryProposal | null);

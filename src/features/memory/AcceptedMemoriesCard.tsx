import { BookCheck, Clock4, Eye } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { MoriSection } from "../../components/ui/MoriSection";
import { describeProposalKind } from "../../lib/project-memory/projectMemoryConsolidationState";
import {
  describeAcceptedMemoryStorageSource,
  type AcceptedMemoryStorageSource,
} from "../../lib/project-memory/acceptedMemoryRepository";
import type { StoredAcceptedProjectMemory } from "../../lib/storage/storageTypes";

/**
 * Compact "Accepted Project Memories" card shown on the Memory
 * page. Reads from the browser repository's
 * `listAcceptedProjectMemories(projectId)` output. No raw evidence
 * content is rendered here — each row surfaces title, status,
 * acceptedAt, and evidence count only.
 *
 * When Resume and Report Memory Integration ships, the accepted
 * records below will outrank the live cross-session aggregation in
 * Resume Prompt and Reports. Today the card is a read-only display
 * surface.
 */
export function AcceptedMemoriesCard({
  memories,
  reviewActionCount,
  storageSource,
  storageFellBack,
}: {
  memories: StoredAcceptedProjectMemory[];
  reviewActionCount: number;
  storageSource: AcceptedMemoryStorageSource;
  storageFellBack: boolean;
}) {
  const recent = memories.slice(0, 6);
  return (
    <MoriSection
      className="memory-accepted"
      ariaLabel="Accepted Project Memories"
      title={
        <span className="memory-accepted-title">
          <BookCheck size={14} aria-hidden="true" /> Accepted Project Memories
        </span>
      }
      hint={
        <span>
          승인한 consolidation 결과를 로컬에 영구 저장합니다. Resume Prompt / Reports와의 연동은
          별도 capability에서 구현됩니다.
        </span>
      }
      actions={<Badge tone={memories.length > 0 ? "green" : "gray"}>{memories.length}건</Badge>}
    >
      {memories.length === 0 ? (
        <p className="memory-accepted-empty">
          아직 저장된 accepted memory가 없습니다. Memory Consolidation 카드에서 Review를 열고 제안을
          승인하면 여기 누적됩니다.
        </p>
      ) : (
        <ul className="memory-accepted-list">
          {recent.map((memory) => (
            <li key={memory.id}>
              <header>
                <strong title={memory.title}>{memory.title}</strong>
                <span className="memory-accepted-meta">
                  <Badge tone={kindTone(memory.kind)}>{describeProposalKind(memory.kind)}</Badge>
                  <Badge tone={statusTone(memory.status)}>{describeStoredStatus(memory.status)}</Badge>
                </span>
              </header>
              {memory.summary ? <p className="memory-accepted-summary">{memory.summary}</p> : null}
              <small>
                <Clock4 size={11} aria-hidden="true" /> {formatShort(memory.acceptedAt)}
                {" · "}
                <Eye size={11} aria-hidden="true" /> {memory.evidenceRefs.length}건 evidence ·
                {" "}
                {memory.sourceSessionIds.length}개 session
                {" · "}
                <Badge tone="gray">local-only</Badge>
              </small>
            </li>
          ))}
        </ul>
      )}
      <footer className="memory-accepted-footer">
        <small>
          감사 로그 {reviewActionCount}건 기록됨 · 저장 위치:{" "}
          <Badge tone={storageSource === "desktop-sqlite" ? "green" : "purple"}>
            {describeAcceptedMemoryStorageSource(storageSource)}
          </Badge>
          {storageFellBack
            ? " · 데스크톱 SQLite를 사용할 수 없어 localStorage로 안전하게 대체했습니다."
            : ""}
        </small>
      </footer>
    </MoriSection>
  );
}

function describeStoredStatus(status: StoredAcceptedProjectMemory["status"]): string {
  switch (status) {
    case "accepted":
      return "수락";
    case "edited":
      return "편집";
    case "watching":
      return "관찰";
    case "deferred":
      return "연기";
    case "superseded":
      return "대체됨";
    case "retired":
      return "은퇴";
    default:
      return status;
  }
}

function statusTone(status: StoredAcceptedProjectMemory["status"]):
  | "green" | "blue" | "orange" | "red" | "gray" | "purple" {
  switch (status) {
    case "accepted":
      return "green";
    case "edited":
      return "blue";
    case "watching":
      return "purple";
    case "deferred":
      return "orange";
    case "superseded":
    case "retired":
      return "gray";
    default:
      return "gray";
  }
}

function kindTone(kind: StoredAcceptedProjectMemory["kind"]):
  | "green" | "blue" | "orange" | "red" | "gray" | "purple" {
  switch (kind) {
    case "promotedDecision":
      return "green";
    case "recurringIssue":
      return "orange";
    case "keyEvidence":
      return "purple";
    case "unresolvedRisk":
      return "red";
    case "nextSessionRecommendation":
      return "blue";
    case "contradiction":
      return "red";
    case "staleMemory":
      return "gray";
    default:
      return "gray";
  }
}

function formatShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

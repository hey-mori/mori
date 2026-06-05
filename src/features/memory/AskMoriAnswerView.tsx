import { Eye } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import type { AskMoriAnswer } from "../../lib/ask-mori/askMoriTypes";
import { describeProposalKind } from "../../lib/project-memory/projectMemoryConsolidationState";

/**
 * Renders one Ask Mori answer: the prose (or deterministic listing), an
 * honest basis badge, and the cited references with back-links.
 *
 * Shared by every Ask Mori consumer (the Project Memory `AskMoriCard` and
 * the Home command space) so a generated answer reads identically wherever
 * it surfaces and the citation/basis wording never drifts between them.
 */
export function AskMoriAnswerView({
  answer,
  onSelectMemory,
  onNavigateEvent,
}: {
  answer: AskMoriAnswer;
  /** Open the accepted-memory detail for a cited memory. */
  onSelectMemory?: (memoryId: string) => void;
  /** Jump to a cited timeline event. */
  onNavigateEvent?: (eventId: string) => void;
}) {
  return (
    <div className="ask-mori-answer-block">
      <div className="ask-mori-answer-head">
        <Badge tone={basisTone(answer.basis)}>{basisLabel(answer.basis)}</Badge>
        {answer.containsNonCurrent ? <Badge tone="gray">비현재 근거 포함</Badge> : null}
      </div>

      <p className="ask-mori-answer">{answer.text}</p>

      {answer.citations.length > 0 ? (
        <div className="memory-search-references">
          <h4>
            <Eye size={12} aria-hidden="true" /> 근거 ({answer.citations.length})
          </h4>
          <ul>
            {answer.citations.map((citation) => {
              const onOpen = citationOpenHandler(citation, onSelectMemory, onNavigateEvent);
              return (
                <li key={`${citation.kind}:${citation.refId}`}>
                  <header>
                    {onOpen ? (
                      <button
                        type="button"
                        className="ask-mori-cite-link"
                        onClick={onOpen}
                        title={`${citation.label} 열기`}
                      >
                        [{citation.tag}] {citation.label}
                      </button>
                    ) : (
                      <strong title={citation.label}>
                        [{citation.tag}] {citation.label}
                      </strong>
                    )}
                    <span className="memory-search-meta">
                      {citation.kind === "acceptedMemory" ? (
                        <Badge tone="purple">{describeProposalKind(citationKindArg(citation))}</Badge>
                      ) : (
                        <Badge tone="blue">{citationKindLabel(citation.kind)}</Badge>
                      )}
                      <Badge tone={citation.isCurrent ? "green" : "gray"}>
                        {citation.isCurrent ? "현재" : "비현재"}
                      </Badge>
                    </span>
                  </header>
                  <p className="memory-search-snippet">{citation.snippet}</p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <small className="ask-mori-basis">{answer.dataBasis}</small>
    </div>
  );
}

/**
 * Resolve a click handler for a citation: accepted-memory citations open
 * the memory detail; timeline-event citations jump to the event.
 * Evidence-source and review-action citations have no single-target
 * destination, so they render as static rows.
 */
function citationOpenHandler(
  citation: AskMoriAnswer["citations"][number],
  onSelectMemory?: (memoryId: string) => void,
  onNavigateEvent?: (eventId: string) => void,
): (() => void) | null {
  if (citation.kind === "acceptedMemory" && onSelectMemory) {
    return () => onSelectMemory(citation.refId);
  }
  if (citation.kind === "timelineEvent" && onNavigateEvent) {
    return () => onNavigateEvent(citation.refId);
  }
  return null;
}

function basisLabel(basis: AskMoriAnswer["basis"]): string {
  if (basis === "llm") return "로컬 LLM 답변";
  if (basis === "deterministicFallback") return "규칙 기반 정리";
  return "근거 없음";
}

function basisTone(basis: AskMoriAnswer["basis"]): "green" | "gray" {
  return basis === "llm" ? "green" : "gray";
}

function citationKindLabel(kind: AskMoriAnswer["citations"][number]["kind"]): string {
  if (kind === "timelineEvent") return "타임라인";
  if (kind === "evidenceSource") return "자료";
  if (kind === "reviewAction") return "검토";
  return "메모리";
}

// `describeProposalKind` expects the accepted-memory kind union; the
// citation carries it as the context label for acceptedMemory citations.
function citationKindArg(
  citation: AskMoriAnswer["citations"][number],
): Parameters<typeof describeProposalKind>[0] {
  return citation.contextLabel as Parameters<typeof describeProposalKind>[0];
}

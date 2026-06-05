import { useState, type FormEvent } from "react";
import { MessageCircleQuestion, Send } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { BaseSection } from "../../components/ui/BaseSection";
import { SearchField } from "../../components/ui/SearchField";
import { createAskMoriLlmFromSettings } from "../../lib/ask-mori/askMoriLlm";
import type { AskMoriAnswer } from "../../lib/ask-mori/askMoriTypes";
import { memoryAsk } from "../../lib/memory-api/memoryApi";
import type { MemoryCapabilityInput } from "../../lib/memory-api/memoryApiTypes";
import type { QuickPassAnalysisSettings } from "../../lib/analysis/analysisSettings";
import { AskMoriAnswerView } from "./AskMoriAnswerView";

/**
 * Ask Mori card on the Project Memory page.
 *
 * The LLM-powered sibling of the deterministic Memory Search card. The
 * user asks a natural-language question; the answer is built from the
 * project's already-reviewed memory (accepted memories + the active
 * session's timeline / evidence references) and cited back to those
 * items. With a configured Local LLM the answer is prose; with none it
 * degrades honestly to a deterministic listing of the matched memory.
 *
 * Nothing is persisted. The answer is a proposal, never durable memory,
 * and no raw transcript or connector log is read or shown.
 */
export function AskMoriCard({
  input,
  settings,
  onSelectMemory,
  onNavigateEvent,
}: {
  input: MemoryCapabilityInput;
  settings: QuickPassAnalysisSettings;
  /** Open the accepted-memory detail drawer for a cited memory. */
  onSelectMemory?: (memoryId: string) => void;
  /** Jump to a cited timeline event in the session timeline. */
  onNavigateEvent?: (eventId: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskMoriAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSearchableData =
    input.acceptedMemories.length > 0 ||
    input.events.length > 0 ||
    input.sources.length > 0 ||
    input.reviewActions.length > 0;
  const llmConnected = settings.provider !== "deterministic";

  async function handleAsk(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length === 0 || asking) return;
    setAsking(true);
    setError(null);
    try {
      const llm = createAskMoriLlmFromSettings(settings);
      const result = await memoryAsk(input, trimmed, llm ? { llm } : {});
      setAnswer(result);
    } catch {
      setError("답변 생성 중 문제가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <BaseSection
      className="ask-mori memory-search"
      ariaLabel="Mori에게 묻기"
      title={
        <span className="memory-search-title">
          <MessageCircleQuestion size={14} aria-hidden="true" /> Mori에게 묻기
        </span>
      }
      hint={
        <span>
          검토를 마친 메모리와 활성 세션의 근거만으로 질문에 답합니다. 로컬 LLM이 연결되어
          있으면 문장으로, 없으면 관련 메모리를 정리해 보여줍니다. 답변은 제안이며 durable
          메모리에 저장되지 않고, 원본 대화나 connector 로그는 읽지 않습니다.
        </span>
      }
      actions={
        <Badge tone={answer?.llmFailed ? "gray" : llmConnected ? "green" : "gray"}>
          {answer?.llmFailed
            ? "로컬 LLM 응답 실패"
            : llmConnected
              ? "로컬 LLM 설정됨"
              : "LLM 미연결 · 규칙 기반"}
        </Badge>
      }
    >
      {!hasSearchableData ? (
        <p className="memory-search-empty">
          아직 답변에 사용할 확정 메모리나 세션 데이터가 없습니다. 통합 검토에서 제안을
          승인하면 Mori에게 물어볼 수 있습니다.
        </p>
      ) : (
        <>
          <form className="ask-mori-form" onSubmit={handleAsk}>
            <SearchField
              className="ask-mori-input"
              value={question}
              onChange={setQuestion}
              placeholder="예: 인증 방식은 어떻게 결정했나요?"
              ariaLabel="Mori에게 질문"
            />
            <button
              type="submit"
              className="ask-mori-submit"
              disabled={asking || question.trim().length === 0}
            >
              <Send size={13} aria-hidden="true" /> {asking ? "묻는 중…" : "묻기"}
            </button>
          </form>

          {error ? <p className="memory-search-empty">{error}</p> : null}

          {answer ? (
            <AskMoriAnswerView
              answer={answer}
              onSelectMemory={onSelectMemory}
              onNavigateEvent={onNavigateEvent}
            />
          ) : null}
        </>
      )}

      <footer className="memory-search-footer">
        <small>
          <Badge tone="gray">로컬 전용</Badge> 답변은 검토된 메모리에 근거한 제안입니다.
          확정 메모리가 비현재(stale / 모순 / 참조)인 경우 함께 표시됩니다.
        </small>
      </footer>
    </BaseSection>
  );
}

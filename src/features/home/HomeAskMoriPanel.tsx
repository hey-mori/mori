import { useEffect, useState } from "react";
import { createAskMoriLlmFromSettings } from "../../lib/ask-mori/askMoriLlm";
import { memoryAsk } from "../../lib/memory-api/memoryApi";
import type { AskMoriAnswer } from "../../lib/ask-mori/askMoriTypes";
import { useMemoryService } from "../memory/useMemoryService";
import { AskMoriAnswerView } from "../memory/AskMoriAnswerView";

export function HomeAskMoriPanel({
  question,
  requestId,
  onSelectMemory,
  onNavigateEvent,
}: {
  question: string;
  requestId: number;
  onSelectMemory: () => void;
  onNavigateEvent: () => void;
}) {
  const { input, settings } = useMemoryService();
  const [answer, setAnswer] = useState<AskMoriAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = question.trim();
    if (!trimmed) return;
    let cancelled = false;
    setAsking(true);
    setAnswer(null);
    setError(null);

    const llm = createAskMoriLlmFromSettings(settings);
    void memoryAsk(input, trimmed, llm ? { llm } : {})
      .then((result) => {
        if (!cancelled) setAnswer(result);
      })
      .catch(() => {
        if (!cancelled) {
          setError("답변 생성 중 문제가 발생했습니다. 다시 시도해 주세요.");
        }
      })
      .finally(() => {
        if (!cancelled) setAsking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [input, question, requestId, settings]);

  if (asking) {
    return <p className="mcs-answer-status">메모리에서 답을 찾는 중...</p>;
  }
  if (error) return <p className="mcs-answer-status">{error}</p>;
  if (!answer) return null;

  return (
    <AskMoriAnswerView
      answer={answer}
      onSelectMemory={onSelectMemory}
      onNavigateEvent={onNavigateEvent}
    />
  );
}

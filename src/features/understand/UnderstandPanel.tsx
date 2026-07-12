/**
 * 이해하기 result panel, rendered in the session's Context Inspector rail.
 *
 * States are honest, never faked: with no LLM engine configured (규칙 기반)
 * it explains what to connect instead of inventing an answer; an engine error
 * shows the reason with a retry. Results render as the labeled sections the
 * prompt contract defines (번역 · 의미 · 표현 · 뉘앙스), falling back to one
 * raw 설명 section when the engine ignores the contract.
 *
 * L1 scope on purpose: no saving. The result shape (`UnderstandResult`) is
 * already what a later 기억하기 action would persist as an expression memory
 * with provenance, so L2 adds a button, not a rewrite.
 */
import { useEffect, useState } from "react";
import { Languages, RotateCcw } from "lucide-react";
import {
  BaseInspectorPanel,
  InspectorActions,
  InspectorCard,
  InspectorEmpty,
  InspectorNote,
  InspectorSection,
} from "../../components/ui/BaseInspectorPanel";
import { useSessionStore } from "../../app/sessionStore";
import { createAskMoriLlmFromSettings } from "../../lib/ask-mori";
import {
  buildUnderstandPrompt,
  parseUnderstandResponse,
  type UnderstandResult,
} from "../../lib/understand";

type PanelState =
  | { phase: "no-engine" }
  | { phase: "loading" }
  | { phase: "done"; result: UnderstandResult }
  | { phase: "error"; message: string };

export function UnderstandPanel({
  selection,
  contextLabel,
  onClose,
}: {
  selection: string;
  contextLabel?: string;
  onClose: () => void;
}) {
  const settings = useSessionStore((state) => state.analysisSettings);
  const [state, setState] = useState<PanelState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const llm = createAskMoriLlmFromSettings(settings);
    if (!llm) {
      setState({ phase: "no-engine" });
      return;
    }
    let cancelled = false;
    setState({ phase: "loading" });
    const prompt = buildUnderstandPrompt({ selection, contextLabel });
    llm({ systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt })
      .then((reply) => {
        if (cancelled) return;
        setState({ phase: "done", result: parseUnderstandResponse(reply, prompt.sourceLang) });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          phase: "error",
          message: error instanceof Error ? error.message : "엔진 호출에 실패했습니다.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [selection, contextLabel, settings, attempt]);

  const preview = selection.length > 160 ? `${selection.slice(0, 160)}…` : selection;

  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel="이해하기 결과"
      eyebrow={<span className="understand-eyebrow">이해하기</span>}
      title={
        <span className="understand-title">
          <Languages size={15} aria-hidden="true" />
          선택한 텍스트
        </span>
      }
      description={<span className="understand-selection">{preview}</span>}
      onClose={onClose}
    >
      {state.phase === "no-engine" ? (
        <InspectorSection>
          <InspectorEmpty>연결된 분석 엔진이 없습니다.</InspectorEmpty>
          <InspectorNote>
            설정에서 Ollama 또는 OpenAI 호환 엔진을 연결하면 선택한 텍스트의 번역과
            문맥 설명을 볼 수 있습니다. 규칙 기반 모드는 이 기능을 제공하지 않습니다.
          </InspectorNote>
        </InspectorSection>
      ) : state.phase === "loading" ? (
        <InspectorSection>
          <p className="understand-loading">
            문맥을 읽는 중
            <span className="understand-loading-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </p>
        </InspectorSection>
      ) : state.phase === "error" ? (
        <InspectorSection>
          <InspectorNote>{state.message}</InspectorNote>
          <InspectorActions>
            <button
              type="button"
              className="understand-retry"
              onClick={() => setAttempt((count) => count + 1)}
            >
              <RotateCcw size={13} aria-hidden="true" />
              다시 시도
            </button>
          </InspectorActions>
        </InspectorSection>
      ) : state.result.sections.length === 0 ? (
        <InspectorSection>
          <InspectorEmpty>엔진이 빈 답을 돌려주었습니다.</InspectorEmpty>
        </InspectorSection>
      ) : (
        state.result.sections.map((section, index) => (
          <InspectorSection key={`${section.key}-${index}`} title={section.label}>
            <InspectorCard>
              <p>{section.body}</p>
            </InspectorCard>
          </InspectorSection>
        ))
      )}
    </BaseInspectorPanel>
  );
}

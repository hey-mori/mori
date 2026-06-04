import { useMemo, useState } from "react";
import { BookText, Sparkles } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { BaseSection } from "../../components/ui/BaseSection";
import { createAskMoriLlmFromSettings } from "../../lib/ask-mori/askMoriLlm";
import { extractGlossaryTerms } from "../../lib/glossary/extractGlossaryTerms";
import { defineGlossaryTerm } from "../../lib/glossary/glossaryDefinition";
import type { GlossaryDefinition } from "../../lib/glossary/glossaryDefinition";
import type { GlossaryTerm, GlossaryTermKind } from "../../lib/glossary/glossaryTypes";
import type { QuickPassAnalysisSettings } from "../../lib/analysis/analysisSettings";
import type { SourceRef, TimelineEvent } from "../../domain/types";

/**
 * Glossary card on the Project Memory page.
 *
 * Surfaces the technical terms that recur in the active session's reviewed
 * evidence (deterministic extraction), each with its kind, occurrence
 * count, and an on-demand "설명" that defines the term via the Local LLM
 * (or lists where it appears when no LLM is connected). Reviewed curated
 * fields only; nothing is persisted.
 */
export function GlossaryCard({
  events,
  sources,
  settings,
}: {
  events: TimelineEvent[];
  sources: SourceRef[];
  settings: QuickPassAnalysisSettings;
}) {
  const result = useMemo(() => extractGlossaryTerms({ events, sources }), [events, sources]);
  const [definitions, setDefinitions] = useState<Record<string, GlossaryDefinition>>({});
  const [definingKey, setDefiningKey] = useState<string | null>(null);

  const llmConnected = settings.provider !== "deterministic";

  async function handleDefine(term: GlossaryTerm) {
    const key = termKey(term);
    if (definingKey !== null) return;
    setDefiningKey(key);
    try {
      const llm = createAskMoriLlmFromSettings(settings);
      const definition = await defineGlossaryTerm(term, llm ? { llm } : {});
      setDefinitions((prev) => ({ ...prev, [key]: definition }));
    } finally {
      setDefiningKey(null);
    }
  }

  return (
    <BaseSection
      className="glossary memory-search"
      ariaLabel="용어 해설"
      title={
        <span className="memory-search-title">
          <BookText size={14} aria-hidden="true" /> 용어 해설
        </span>
      }
      hint={
        <span>
          이 세션의 검토된 근거에 자주 등장하는 기술 용어를 모았습니다. 각 용어의 "설명"은
          로컬 LLM이 일반적 의미와 이 작업에서의 쓰임을 함께 풀어 주며, LLM이 없으면 등장
          위치만 보여줍니다. 원본 대화나 connector 로그는 읽지 않습니다.
        </span>
      }
      actions={
        <Badge tone={result.terms.length > 0 ? "purple" : "gray"}>{result.terms.length}개</Badge>
      }
    >
      {result.terms.length === 0 ? (
        <p className="memory-search-empty">
          이 세션의 근거에서 추출할 기술 용어가 아직 없습니다. 더 많은 작업을 가져오면 용어가
          모입니다.
        </p>
      ) : (
        <ul className="memory-search-results">
          {result.terms.map((term) => {
            const key = termKey(term);
            const definition = definitions[key];
            const isDefining = definingKey === key;
            return (
              <li key={key} className="memory-search-result">
                <header>
                  <strong title={term.term}>{term.term}</strong>
                  <span className="memory-search-meta">
                    <Badge tone="blue">{kindLabel(term.kind)}</Badge>
                    <Badge tone="gray">{term.occurrences}회</Badge>
                  </span>
                </header>

                {definition ? (
                  <p className="glossary-def">{definition.text}</p>
                ) : (
                  <p className="memory-search-snippet">
                    {term.evidenceRefs.map((ref) => ref.title).join(" · ")}
                  </p>
                )}

                <div className="glossary-row-foot">
                  <small>근거 {term.evidenceRefs.length}건</small>
                  {definition ? (
                    <Badge tone={definition.usedLlm ? "green" : "gray"}>
                      {definition.usedLlm ? "LLM 설명" : "등장 위치"}
                    </Badge>
                  ) : (
                    <button
                      type="button"
                      className="glossary-define-btn"
                      onClick={() => handleDefine(term)}
                      disabled={definingKey !== null}
                    >
                      <Sparkles size={12} aria-hidden="true" />
                      {isDefining ? "설명 생성 중…" : "설명"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="memory-search-footer">
        <small>
          <Badge tone="gray">로컬 전용</Badge> {result.dataBasis}{" "}
          {llmConnected ? "설명은 연결된 로컬 LLM이 생성합니다." : "LLM 미연결 · 설명은 등장 위치만 표시합니다."}
        </small>
      </footer>
    </BaseSection>
  );
}

function termKey(term: GlossaryTerm): string {
  return `${term.kind}:${term.term}`;
}

function kindLabel(kind: GlossaryTermKind): string {
  if (kind === "code") return "코드";
  if (kind === "acronym") return "약어";
  return "용어구";
}

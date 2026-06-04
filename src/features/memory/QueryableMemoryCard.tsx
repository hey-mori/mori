import { useMemo, useState } from "react";
import { Eye, Layers, Link2, Search } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { BaseSection } from "../../components/ui/BaseSection";
import { SearchField } from "../../components/ui/SearchField";
import { describeProposalKind } from "../../lib/project-memory/projectMemoryConsolidationState";
import { getProductMemoryStatusLabel } from "../../lib/product-state/productState";
import { memorySearch } from "../../lib/memory-api/memoryApi";
import type { MemoryCapabilityInput } from "../../lib/memory-api/memoryApiTypes";

/**
 * Queryable Memory card on the Project Memory page.
 *
 * A compact local search surface. The primary results are the
 * project's accepted memories (`searchAcceptedMemories`); a secondary
 * "Related references" section searches the active session's timeline
 * events and evidence sources (`searchProjectMemoryReferences`).
 * Local-only and deterministic — no transcripts or connector logs are
 * read or shown. Non-current memory stays searchable but is marked.
 */
export function QueryableMemoryCard({ input }: { input: MemoryCapabilityInput }) {
  const [query, setQuery] = useState("");
  const searchResult = useMemo(() => memorySearch(input, { text: query }), [input, query]);
  const resultSet = searchResult.memories;
  const references = searchResult.references;

  const hasSearchableData =
    input.acceptedMemories.length > 0 ||
    input.events.length > 0 ||
    input.sources.length > 0 ||
    input.reviewActions.length > 0;
  const trimmedQuery = query.trim();

  return (
    <BaseSection
      className="memory-search"
      ariaLabel="메모리 검색"
      title={
        <span className="memory-search-title">
          <Search size={14} aria-hidden="true" /> 메모리 검색
        </span>
      }
      hint={
        <span>
          확정 메모리를 로컬에서 구조적으로 검색합니다. 활성 세션의 timeline / evidence
          참조도 함께 찾으며, 원본 대화나 connector 로그는 검색하지 않습니다.
        </span>
      }
      actions={
        <Badge tone={resultSet.matchCount > 0 ? "green" : "gray"}>
          {resultSet.matchCount}건
        </Badge>
      }
    >
      {!hasSearchableData ? (
        <p className="memory-search-empty">
          아직 검색할 확정 메모리나 세션 데이터가 없습니다. 통합 검토에서 제안을 승인하면 여기에서
          검색할 수 있습니다.
        </p>
      ) : (
        <>
          <SearchField
            className="memory-search-input"
            value={query}
            onChange={setQuery}
            placeholder=""
            ariaLabel="프로젝트 메모리 검색"
          />

          {input.acceptedMemories.length === 0 ? (
            <p className="memory-search-empty">아직 확정된 메모리가 없습니다.</p>
          ) : resultSet.results.length === 0 ? (
            <p className="memory-search-empty">
              {trimmedQuery
                ? `"${trimmedQuery}"에 해당하는 메모리가 없습니다.`
                : "검색어를 입력하면 확정 메모리에서 찾습니다."}
            </p>
          ) : (
            <ul className="memory-search-results">
              {resultSet.results.map((result) => (
                <li key={result.memoryId} className="memory-search-result">
                  <header>
                    <strong title={result.title}>{result.title}</strong>
                    <span className="memory-search-meta">
                      <Badge tone="purple">{describeProposalKind(result.kind)}</Badge>
                      <Badge tone={result.isCurrent ? "green" : "gray"}>
                        {result.isCurrent ? "현재" : `${getProductMemoryStatusLabel(result.status)} · 비현재`}
                      </Badge>
                    </span>
                  </header>
                  <p className="memory-search-snippet">{result.snippet}</p>
                  <small>
                    {result.matchReason}
                    {" · "}
                    <Eye size={11} aria-hidden="true" /> 근거 {result.evidenceCount}건
                    {" · "}
                    <Layers size={11} aria-hidden="true" /> 세션 {result.sourceSessionCount}개
                  </small>
                </li>
              ))}
            </ul>
          )}

          {references.length > 0 ? (
            <div className="memory-search-references">
              <h4>
                <Link2 size={12} aria-hidden="true" /> 관련 참조 ({references.length})
              </h4>
              <ul>
                {references.map((reference) => (
                  <li key={`${reference.resultKind}:${reference.refId}`}>
                    <header>
                      <strong title={reference.title}>{reference.title}</strong>
                      <Badge tone="blue">
                        {referenceKindLabel(reference.resultKind)} · {reference.contextLabel}
                      </Badge>
                    </header>
                    <p className="memory-search-snippet">{reference.snippet}</p>
                    <small>{reference.matchReason}</small>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <footer className="memory-search-footer">
        <small>
          <Badge tone="gray">로컬 전용</Badge> {resultSet.dataBasis} 참조 검색은 활성 세션의
          timeline / evidence와 검토 액션 노트를 대상으로 합니다.
        </small>
      </footer>
    </BaseSection>
  );
}

function referenceKindLabel(kind: "timelineEvent" | "evidenceSource" | "reviewAction"): string {
  if (kind === "timelineEvent") return "타임라인";
  if (kind === "evidenceSource") return "자료";
  return "검토";
}

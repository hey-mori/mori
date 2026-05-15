import { useMemo, useState } from "react";
import { Eye, Layers, Search } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { MoriSection } from "../../components/ui/MoriSection";
import { describeProposalKind } from "../../lib/project-memory/projectMemoryConsolidationState";
import { searchAcceptedMemories } from "../../lib/project-memory/queryableMemory";
import type { StoredAcceptedProjectMemory } from "../../lib/storage/storageTypes";

/**
 * Queryable Memory card on the Project Memory page.
 *
 * A compact local search surface over the project's accepted
 * memories, backed by the deterministic `searchAcceptedMemories`
 * helper. Local-only — no transcripts or connector logs are read or
 * shown. Non-current memory (`stale` / `contradicted` / `superseded`
 * / `retired` / `watching` / `deferred`) is searchable but clearly
 * marked so it never reads as current guidance.
 */
export function QueryableMemoryCard({
  memories,
}: {
  memories: StoredAcceptedProjectMemory[];
}) {
  const [query, setQuery] = useState("");
  const resultSet = useMemo(
    () => searchAcceptedMemories(memories, { text: query }),
    [memories, query],
  );

  return (
    <MoriSection
      className="memory-search"
      ariaLabel="Queryable Memory"
      title={
        <span className="memory-search-title">
          <Search size={14} aria-hidden="true" /> Memory Search
        </span>
      }
      hint={
        <span>
          Accepted memory를 로컬에서 구조적으로 검색합니다. 제목 / 요약 / 근거 참조 기준이며
          원본 대화나 connector 로그는 검색하지 않습니다.
        </span>
      }
      actions={
        <Badge tone={resultSet.matchCount > 0 ? "green" : "gray"}>
          {resultSet.matchCount}건
        </Badge>
      }
    >
      {memories.length === 0 ? (
        <p className="memory-search-empty">
          아직 accepted memory가 없습니다. Consolidation Review에서 제안을 승인하면 여기에서
          검색할 수 있습니다.
        </p>
      ) : (
        <>
          <label className="memory-search-input">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목 / 요약 / 근거에서 검색"
              aria-label="Search accepted memory"
            />
          </label>

          {resultSet.results.length === 0 ? (
            <p className="memory-search-empty">
              "{query.trim()}"에 해당하는 accepted memory가 없습니다.
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
                        {result.isCurrent ? "현재" : `${result.status} · 비현재`}
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
        </>
      )}

      <footer className="memory-search-footer">
        <small>
          <Badge tone="gray">local-only</Badge> {resultSet.dataBasis} Timeline / Evidence 검색
          확장은 별도 capability로 예정되어 있습니다.
        </small>
      </footer>
    </MoriSection>
  );
}

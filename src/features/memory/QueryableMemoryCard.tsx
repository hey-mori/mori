import { useMemo, useState } from "react";
import { Eye, Layers, Link2, Search } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { MoriSection } from "../../components/ui/MoriSection";
import { describeProposalKind } from "../../lib/project-memory/projectMemoryConsolidationState";
import {
  searchAcceptedMemories,
  searchProjectMemoryReferences,
} from "../../lib/project-memory/queryableMemory";
import type { SourceRef, TimelineEvent } from "../../domain/types";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../../lib/storage/storageTypes";

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
export function QueryableMemoryCard({
  memories,
  timelineEvents,
  evidenceSources,
  reviewActions,
}: {
  memories: StoredAcceptedProjectMemory[];
  timelineEvents: TimelineEvent[];
  evidenceSources: SourceRef[];
  reviewActions: StoredMemoryReviewAction[];
}) {
  const [query, setQuery] = useState("");
  const resultSet = useMemo(
    () => searchAcceptedMemories(memories, { text: query }),
    [memories, query],
  );
  const references = useMemo(
    () =>
      searchProjectMemoryReferences(
        { timelineEvents, evidenceSources, reviewActions },
        { text: query },
      ),
    [timelineEvents, evidenceSources, reviewActions, query],
  );

  const hasSearchableData =
    memories.length > 0 ||
    timelineEvents.length > 0 ||
    evidenceSources.length > 0 ||
    reviewActions.length > 0;
  const trimmedQuery = query.trim();

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
          Accepted memory를 로컬에서 구조적으로 검색합니다. 활성 세션의 timeline / evidence
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
          아직 검색할 accepted memory나 세션 데이터가 없습니다. Consolidation Review에서 제안을
          승인하면 여기에서 검색할 수 있습니다.
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
              aria-label="Search project memory"
            />
          </label>

          {memories.length === 0 ? (
            <p className="memory-search-empty">아직 저장된 accepted memory가 없습니다.</p>
          ) : resultSet.results.length === 0 ? (
            <p className="memory-search-empty">
              {trimmedQuery
                ? `"${trimmedQuery}"에 해당하는 accepted memory가 없습니다.`
                : "검색어를 입력하면 accepted memory를 찾습니다."}
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
          <Badge tone="gray">local-only</Badge> {resultSet.dataBasis} 참조 검색은 활성 세션의
          timeline / evidence와 검토 액션 노트를 대상으로 합니다.
        </small>
      </footer>
    </MoriSection>
  );
}

function referenceKindLabel(kind: "timelineEvent" | "evidenceSource" | "reviewAction"): string {
  if (kind === "timelineEvent") return "Timeline";
  if (kind === "evidenceSource") return "Evidence";
  return "Review";
}

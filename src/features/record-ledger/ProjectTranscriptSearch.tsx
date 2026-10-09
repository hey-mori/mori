import { useState, type FormEvent } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import { useProjectSearchStore } from "../../app/projectSearchStore";
import type { ClaudeCodeSearchHit } from "../../lib/claude/types";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import {
  canContinue,
  projectSearchCoverage,
  projectSearchStatusLine,
  type ProjectSearchEntry,
  type ProjectSearchInventory,
  type SourceStatus,
} from "../../lib/session/projectSearch";
import { normalizeQuery, SEARCH_QUERY_MAX_CHARS } from "../../lib/session/sessionSearch";

const ROLE: Record<string, string> = { human: "나", assistant: "Claude" };

const SOURCE_STATUS: Record<SourceStatus, string> = {
  pending: "아직 찾지 않음",
  searching: "찾는 중",
  partial: "일부 찾음",
  done: "끝까지 찾음",
  changed: "원본이 바뀜",
  missing: "원본 없음",
  error: "읽지 못함",
  excluded: "프로젝트에서 빠짐",
};

function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Search the confirmed sessions of one project for a phrase, and open a
 * result at its passage. Results are grouped by session, newest match first
 * within each; the coverage line says what was and was not searched.
 */
export function ProjectTranscriptSearch({
  inventory,
  unconfirmed,
  contextLabel,
  onOpened,
  onClose,
}: {
  inventory: Extract<ProjectSearchInventory, { kind: "ok" }>;
  /** Sessions the page shows for this project that are not confirmed members. */
  unconfirmed: number;
  /** A descendant project's label, by context id. */
  contextLabel: (contextId: string) => string;
  onOpened: () => void;
  onClose: () => void;
}) {
  const store = useProjectSearchStore();
  const search = store.search?.projectId === inventory.projectId ? store.search : null;
  const [query, setQuery] = useState(search?.query ?? "");
  const searching = search?.status === "searching";
  const coverage = search ? projectSearchCoverage(search) : null;
  const entryById = new Map(inventory.entries.map((entry) => [entry.sessionId, entry]));
  const shownEntries: ProjectSearchEntry[] = search ? search.entries : inventory.entries;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!normalizeQuery(query)) return;
    void store.start(inventory, query);
  };
  const open = (sessionId: string, hit: ClaudeCodeSearchHit) => {
    // Membership is checked again against what the page holds now.
    if (entryById.get(sessionId)?.kind !== "searchable") return;
    void store.openHit(sessionId, hit).then((outcome) => {
      if (outcome === "opened") onOpened();
    });
  };

  const groups = search
    ? search.order
        .map((id) => ({ entry: search.entries.find((entry) => entry.sessionId === id)!, source: search.sources[id]! }))
        .filter(({ source }) => source.status !== "excluded" && source.hits.length > 0)
    : [];

  return (
    <section className="ctx-section project-search" aria-label="이 프로젝트의 대화에서 찾기">
      <form className="project-search-form" onSubmit={submit} role="search">
        <input
          className="project-search-input"
          type="search"
          value={query}
          maxLength={SEARCH_QUERY_MAX_CHARS}
          placeholder="이 프로젝트의 대화에서 찾을 문구"
          aria-label="찾을 문구"
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
        {searching ? (
          <Button size="sm" variant="ghost" onClick={store.stop}>
            멈추기
          </Button>
        ) : (
          <Button size="sm" type="submit" icon={Search} disabled={!normalizeQuery(query)}>
            찾기
          </Button>
        )}
        <InfoHint label="이 프로젝트의 대화에서 찾기">
          이 프로젝트에 확정한 세션의 원본 대화만 찾습니다{inventory.descendants > 0 ? ` (하위 프로젝트 ${inventory.descendants}개 포함)` : ""}.
          제안만 된 세션, 확정하지 않거나 제외한 세션은 찾지 않습니다. 찾기를 누를 때 원본 파일을 읽고, 결과와 검색어는
          저장하지 않습니다. 대소문자는 구분하지 않고 화면에 보이는 메시지 내용만 찾습니다. 지금은 Claude Code 대화만 찾을 수
          있습니다.
        </InfoHint>
        <Button size="sm" variant="ghost" icon={X} onClick={onClose} aria-label="닫기" />
      </form>

      {search && coverage ? (
        <div className="project-search-body">
          <p className="project-search-status" role="status" aria-live="polite">
            {searching ? <Loader2 className="session-window-spin" size={12} aria-hidden="true" /> : null}
            <span>{projectSearchStatusLine(search)}</span>
          </p>
          <details className="project-search-coverage">
            <summary>찾은 범위</summary>
            <ul>
              {shownEntries.map((entry) => {
                const source = search.sources[entry.sessionId];
                const label = entry.sameSourceAs
                  ? "다른 세션과 같은 원본이라 함께 찾음"
                  : entry.kind === "unsupported"
                    ? `${entry.agentName} 대화는 아직 찾을 수 없음`
                    : entry.kind === "no-source"
                      ? "원본 위치를 알 수 없음"
                      : source
                        ? SOURCE_STATUS[source.status]
                        : "";
                return (
                  <li key={entry.sessionId}>
                    <span className="project-search-coverage-title">{entry.title}</span>
                    <span>{label}</span>
                  </li>
                );
              })}
            </ul>
            {unconfirmed > 0 ? <p>확정하지 않은 세션 {unconfirmed}개는 찾지 않았습니다.</p> : null}
            {coverage.unsearchableRecords > 0 ? <p>너무 큰 기록 {coverage.unsearchableRecords}개는 찾지 못했습니다.</p> : null}
          </details>

          {groups.length > 0 ? (
            <ol className="project-search-groups">
              {groups.map(({ entry, source }) => (
                <li key={entry.sessionId} className="project-search-group">
                  <p className="project-search-session">
                    <span className="project-search-session-title">{entry.title}</span>
                    <span className="project-search-session-meta">
                      {entry.agentName}
                      {entry.contextId !== inventory.projectId ? ` · ${contextLabel(entry.contextId)}` : ""}
                      {entry.lastActiveAt ? ` · ${formatClaudeRelativeKo(entry.lastActiveAt)}` : ""}
                    </span>
                  </p>
                  <ol className="project-search-hits">
                    {source.hits.map((hit) => {
                      const key = `${entry.sessionId}:${hit.recordStart}`;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            className="project-search-hit"
                            onClick={() => open(entry.sessionId, hit)}
                            disabled={store.opening !== null}
                          >
                            <span className="project-search-hit-head">
                              <span className="session-window-role">{hit.subkind ? "도구" : (ROLE[hit.role] ?? hit.role)}</span>
                              {hit.createdAt ? <time dateTime={hit.createdAt}>{clock(hit.createdAt)}</time> : null}
                              {store.opening === key ? <Loader2 className="session-window-spin" size={11} aria-hidden="true" /> : null}
                            </span>
                            <span className="project-search-snippet">
                              {hit.snippetBefore}
                              <mark>{hit.snippetMatch}</mark>
                              {hit.snippetAfter}
                            </span>
                          </button>
                          {store.openError?.key === key ? (
                            <p className="project-search-error" role="alert">
                              {store.openError.outcome === "changed"
                                ? "원본이 바뀌어 이 결과를 확인할 수 없습니다. 다시 찾아 주세요."
                                : store.openError.outcome === "missing"
                                  ? "원본 대화를 찾을 수 없습니다."
                                  : "이 결과를 열지 못했습니다."}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          ) : null}

          {!searching && canContinue(search) ? (
            <Button size="sm" variant="ghost" icon={Search} onClick={() => void store.more()}>
              더 찾기
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

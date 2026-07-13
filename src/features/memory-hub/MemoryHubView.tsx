/**
 * 메모리 · the global memory surface (stage 1 of the shell plan).
 *
 * The first screen that shows what Mori knows across every scope: search over
 * all accepted memories, lifecycle segments reusing the existing vocabulary
 * (현재 · 관찰 중 · 확인 필요 · 보관됨), scope chips per project, and a
 * provenance inspector for the focused memory. Deliberately small and
 * read-first: confirming, correcting, and reverting stay on the project's
 * consolidation surface (deep-linked), and the 잠정 segment arrives only with
 * the governance build, as its own group, never merged into 확인 필요.
 *
 * Reads through `AcceptedMemoryRepository.listAllAcceptedProjectMemories`
 * (SQLite-first with an honest localStorage fallback note) and ranks search
 * with the tested `searchAcceptedMemories`. No writes.
 */
import { useEffect, useMemo, useState } from "react";
import { Brain, FolderGit2, ExternalLink } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import {
  BaseInspectorPanel,
  InspectorActions,
  InspectorCard,
  InspectorFields,
  InspectorNote,
  InspectorSection,
} from "../../components/ui/BaseInspectorPanel";
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import { ToolbarSearch } from "../../components/ui/ToolbarSearch";
import { useAppStore } from "../../app/store";
import { getAcceptedMemoryRepository } from "../../lib/project-memory/acceptedMemoryRepository";
import {
  classifyMemoryLifecycle,
  describeMemoryLifecycleGroup,
  memoryLifecycleGroupTone,
  memoryLifecycleSortWeight,
  type MemoryLifecycleGroup,
} from "../../lib/project-memory/memoryLifecycle";
import { memoryKindLabel } from "../../lib/project-memory/memoryKindLabels";
import { searchAcceptedMemories } from "../../lib/project-memory/queryableMemory";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { StoredAcceptedProjectMemory } from "../../lib/storage/storageTypes";

/** Segment keys: the four lifecycle groups plus `provisional` (a status, not
 *  a lifecycle group) and `all`. 잠정 is deliberately its own segment, never
 *  merged into 확인 필요: provisional memory is already in use (auto-created,
 *  unconfirmed), whereas 확인 필요 is confirmed memory a review flagged. */
type MemorySegmentKey = "all" | "provisional" | MemoryLifecycleGroup;

const LIFECYCLE_SEGMENTS: Array<{ key: MemorySegmentKey; label: string }> = [
  { key: "all", label: "전체" },
  { key: "current", label: "현재" },
  { key: "provisional", label: "잠정" },
  { key: "advisory", label: "관찰 중" },
  { key: "attention", label: "확인 필요" },
  { key: "archived", label: "보관됨" },
];

/** A memory's segment: provisional is its own bucket; everything else falls to
 *  its lifecycle group. */
function memorySegment(memory: StoredAcceptedProjectMemory): MemorySegmentKey {
  return memory.status === "provisional" ? "provisional" : classifyMemoryLifecycle(memory.status);
}

/** Honest status badge label + tone, treating provisional as its own state. */
function memoryBadge(memory: StoredAcceptedProjectMemory): {
  label: string;
  tone: ReturnType<typeof memoryLifecycleGroupTone>;
} {
  if (memory.status === "provisional") return { label: "잠정", tone: "info" };
  const group = classifyMemoryLifecycle(memory.status);
  return { label: describeMemoryLifecycleGroup(group), tone: memoryLifecycleGroupTone(group) };
}

export function MemoryHubView() {
  const openAcceptedMemory = useAppStore((state) => state.openAcceptedMemory);

  const [memories, setMemories] = useState<StoredAcceptedProjectMemory[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] = useState<MemorySegmentKey>("all");
  const [scope, setScope] = useState<"all" | string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAcceptedMemoryRepository()
      .listAllAcceptedProjectMemories()
      .then((result) => {
        if (cancelled) return;
        setMemories(result.data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMemories([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Scope chips: one per project that actually holds memory, busiest first.
  const scopes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const memory of memories) {
      counts.set(memory.projectId, (counts.get(memory.projectId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([projectId, count]) => ({ projectId, count }));
  }, [memories]);

  const lifecycleCounts = useMemo(() => {
    const counts: Record<MemorySegmentKey, number> = {
      all: memories.length,
      provisional: 0,
      current: 0,
      advisory: 0,
      attention: 0,
      archived: 0,
    };
    for (const memory of memories) {
      counts[memorySegment(memory)] += 1;
    }
    return counts;
  }, [memories]);

  const visible = useMemo(() => {
    const scoped = memories.filter(
      (memory) =>
        (scope === "all" || memory.projectId === scope) &&
        (lifecycle === "all" || memorySegment(memory) === lifecycle),
    );
    const text = query.trim();
    if (!text) {
      return [...scoped].sort(
        (a, b) =>
          memoryLifecycleSortWeight(a.status) - memoryLifecycleSortWeight(b.status) ||
          new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime(),
      );
    }
    const byId = new Map(scoped.map((memory) => [memory.id, memory]));
    return searchAcceptedMemories(scoped, { text })
      .results.map((result) => byId.get(result.memoryId))
      .filter((memory): memory is StoredAcceptedProjectMemory => Boolean(memory));
  }, [memories, scope, lifecycle, query]);

  const selected = useMemo(
    () => visible.find((memory) => memory.id === selectedId) ?? null,
    [visible, selectedId],
  );

  const hasMemories = !loading && memories.length > 0;

  const searchEl = hasMemories ? (
    <ToolbarSearch
      value={query}
      onChange={setQuery}
      placeholder="기억을 검색"
      ariaLabel="메모리 검색"
    />
  ) : undefined;

  const segmentsEl = hasMemories ? (
    <div className="memhub-segments" role="tablist" aria-label="상태 필터">
      {LIFECYCLE_SEGMENTS.map((segment) => (
        <button
          key={segment.key}
          type="button"
          role="tab"
          aria-selected={lifecycle === segment.key}
          className={`memhub-seg${lifecycle === segment.key ? " is-active" : ""}`}
          onClick={() => setLifecycle(segment.key)}
        >
          {segment.label}
          <span className="memhub-seg-count">{lifecycleCounts[segment.key]}</span>
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <PageShell
      maxWidth="full"
      actionBar={<ActionBar label="메모리" start={searchEl} end={segmentsEl} />}
    >
      {loading ? null : memories.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="아직 확정된 메모리가 없습니다"
          description="세션을 분석하고 메모리 통합 검토에서 승인하면, 프로젝트를 가로질러 여기에서 검색하고 관리할 수 있습니다."
        />
      ) : (
        <div className={`memhub${selected ? " has-inspector" : ""}`}>
          <div className="memhub-main">
            {scopes.length > 1 ? (
              <div className="memhub-scopes" role="group" aria-label="범위 필터">
                <button
                  type="button"
                  className={`memhub-scope${scope === "all" ? " is-active" : ""}`}
                  onClick={() => setScope("all")}
                >
                  전체 범위
                </button>
                {scopes.map(({ projectId, count }) => (
                  <button
                    key={projectId}
                    type="button"
                    className={`memhub-scope${scope === projectId ? " is-active" : ""}`}
                    title={projectId}
                    onClick={() => setScope(scope === projectId ? "all" : projectId)}
                  >
                    <FolderGit2 size={11} aria-hidden="true" />
                    {shortProjectLabel(projectId)}
                    <span className="memhub-scope-count">{count}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {visible.length === 0 ? (
              <p className="memhub-no-results">조건에 맞는 기억이 없습니다.</p>
            ) : (
              <ul className="memhub-list">
                {visible.map((memory) => {
                  const badge = memoryBadge(memory);
                  return (
                    <li key={memory.id}>
                      <button
                        type="button"
                        className={`memhub-row${memory.id === selectedId ? " is-selected" : ""}`}
                        onClick={() =>
                          setSelectedId((current) => (current === memory.id ? null : memory.id))
                        }
                      >
                        <div className="memhub-row-head">
                          <span className="memhub-row-kind">{memoryKindLabel(memory.kind)}</span>
                          <span className="memhub-row-title">{memory.title}</span>
                          <BaseStatusBadge tone={badge.tone}>{badge.label}</BaseStatusBadge>
                        </div>
                        <p className="memhub-row-summary">{memory.summary}</p>
                        <div className="memhub-row-meta">
                          <span className="memhub-row-scope">
                            <FolderGit2 size={11} aria-hidden="true" />
                            {shortProjectLabel(memory.projectId)}
                          </span>
                          <span>{formatClaudeRelativeKo(memory.acceptedAt)}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {selected ? (
            <MemoryProvenancePanel
              memory={selected}
              onClose={() => setSelectedId(null)}
              onOpenInProject={() => openAcceptedMemory(selected.id)}
            />
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

/** Provenance-first detail for the focused memory: what it is, where it came
 *  from, how sure Mori is, and where to manage it. Read-only by design. */
function MemoryProvenancePanel({
  memory,
  onClose,
  onOpenInProject,
}: {
  memory: StoredAcceptedProjectMemory;
  onClose: () => void;
  onOpenInProject: () => void;
}) {
  const badge = memoryBadge(memory);
  const provisional = memory.status === "provisional";
  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel="메모리 상세"
      eyebrow={
        <>
          <span>{memoryKindLabel(memory.kind)}</span>
          <BaseStatusBadge tone={badge.tone}>{badge.label}</BaseStatusBadge>
        </>
      }
      title={memory.title}
      meta={`${shortProjectLabel(memory.projectId)} · ${formatClaudeRelativeKo(memory.acceptedAt)}`}
      onClose={onClose}
    >
      {provisional ? (
        <InspectorSection>
          <InspectorNote>
            Mori가 자동으로 정리한 잠정 기억입니다. 검색과 답변에는 쓰이지만, 확정 전에는
            리포트나 내보내기에 포함되지 않습니다. 프로젝트 메모리에서 확인하거나 되돌릴 수 있습니다.
          </InspectorNote>
        </InspectorSection>
      ) : null}
      <InspectorSection title="요약">
        <InspectorCard>
          <p>{memory.summary}</p>
        </InspectorCard>
      </InspectorSection>
      <InspectorSection title="근거">
        <InspectorFields
          items={[
            {
              label: "확신",
              value: memory.confidence.rationale
                ? `${memory.confidence.label} · ${memory.confidence.rationale}`
                : memory.confidence.label,
            },
            { label: "근거 참조", value: `${memory.evidenceRefs.length}건` },
            { label: "출처 세션", value: `${memory.sourceSessionIds.length}개` },
            { label: "감사 기록", value: `${memory.reviewActionIds.length}건` },
          ]}
        />
        {memory.reviewNote ? <InspectorNote>{memory.reviewNote}</InspectorNote> : null}
      </InspectorSection>
      <InspectorActions>
        <button type="button" className="memhub-open-project" onClick={onOpenInProject}>
          <ExternalLink size={13} aria-hidden="true" />
          프로젝트 메모리에서 열기
        </button>
      </InspectorActions>
    </BaseInspectorPanel>
  );
}

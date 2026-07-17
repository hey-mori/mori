/**
 * 프로젝트 · a project reads as everything under it — its AI sessions AND its
 * kernel records (notes / decisions / activities). Sessions and records live in
 * two parallel stores; this view merges them by project so the page is filled
 * with the work the user actually has, not an empty kernel-only list.
 *
 * Left: the projects that hold work, busiest first. Right: the selected
 * project's sessions and records, in labeled sections.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, FolderGit2, Pencil, Radio, X } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { useAppStore } from "../../app/store";
import { loadStoredSessionSummaries } from "../../app/sessionStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import { useSessionResolver } from "../session/useSessionResolver";
import { useRecordLedger } from "./useRecordLedger";
import { LedgerRow } from "./LedgerRow";
import { groupRecordsBySection } from "./contextGrouping";
import { buildProjectGroups, type ProjectGroup } from "./projectGroups";
import { ledgerVisibleRecords } from "./recordPresentation";
import { canReparent, contextPath } from "./contextTree";
import type { KernelContext } from "../../lib/record-kernel/kernelTypes";

export function ContextView() {
  const { records, registry, relations, contexts, loading, renameContext, reparentContext } =
    useRecordLedger();
  const navigate = useAppStore((state) => state.navigate);
  // The same door 캘린더 and the command palette already use. 프로젝트 was the only
  // surface that did not, so one note opened as a real document from the
  // calendar and as a 340px textarea from here.
  const openRecordInLedger = useAppStore((state) => state.openRecordInLedger);
  const openSession = useAppStore((state) => state.openSession);
  const resolveSession = useSessionResolver();
  const [summaries] = useState(() => safeSummaries());

  // Open the specific session the user clicked (materializing a discovered
  // session's transcript), not a generic jump to the 세션 workspace.
  const openSessionById = (sessionId: string) => {
    void resolveSession(sessionId).then((ok) => {
      if (ok) openSession("flow");
      else navigate("sessions");
    });
  };
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingContextId, setEditingContextId] = useState<string | null>(null);

  const groups = useMemo(
    () =>
      buildProjectGroups(
        mergeDemoSessionSummaries(summaries),
        contexts,
        ledgerVisibleRecords(records),
        relations,
      ),
    [summaries, contexts, records, relations],
  );

  // Default to the busiest project; keep a valid selection as data changes.
  useEffect(() => {
    if (groups.length === 0) {
      setSelectedProjectId(null);
    } else if (!groups.some((group) => group.id === selectedProjectId)) {
      setSelectedProjectId(groups[0].id);
    }
  }, [groups, selectedProjectId]);

  const ambiguousNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of groups) counts.set(group.name, (counts.get(group.name) ?? 0) + 1);
    return new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name));
  }, [groups]);

  const activeGroup = groups.find((group) => group.id === selectedProjectId) ?? null;
  const recordSections = useMemo(
    () => (activeGroup ? groupRecordsBySection(activeGroup.records) : []),
    [activeGroup],
  );

  return (
    <PageShell maxWidth="full" actionBar={<ActionBar label="프로젝트" />}>
      {loading ? null : groups.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="아직 프로젝트가 없습니다"
          description="AI 세션을 연동하거나 기록을 프로젝트에 담으면, 프로젝트별로 여기에 모입니다."
        />
      ) : (
        <div className="context-page">
          <aside className="context-list" aria-label="프로젝트 목록">
            {groups.map((group) => (
              <ProjectRow
                key={group.id}
                group={group}
                contexts={contexts}
                active={group.id === selectedProjectId}
                showParentPath={Boolean(group.parentPath) && ambiguousNames.has(group.name)}
                editing={editingContextId === group.context?.id}
                onSelect={() => setSelectedProjectId(group.id)}
                onStartEdit={() => setEditingContextId(group.context?.id ?? null)}
                onCancelEdit={() => setEditingContextId(null)}
                onRename={renameContext}
                onReparent={reparentContext}
              />
            ))}
          </aside>

          <div className="context-body">
            {activeGroup ? (
              <>
                {activeGroup.sessions.length > 0 ? (
                  <section className="context-section">
                    <p className="context-section-label">
                      세션
                      <span className="context-section-count">{activeGroup.sessions.length}</span>
                    </p>
                    <ul className="context-session-list">
                      {activeGroup.sessions.map((session) => (
                        <li key={session.sessionId}>
                          <button
                            type="button"
                            className="context-session-row"
                            onClick={() => openSessionById(session.sessionId)}
                          >
                            <span className="context-session-icon" aria-hidden="true">
                              <Radio size={12} />
                            </span>
                            <span className="context-session-title">{session.title}</span>
                            <span className="context-session-time">
                              {formatClaudeRelativeKo(session.startedAt || session.savedAt)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {recordSections.map((section) => (
                  <section key={section.id} className="context-section">
                    <p className="context-section-label">
                      {section.label}
                      <span className="context-section-count">{section.records.length}</span>
                    </p>
                    <ul className="ledger-list">
                      {section.records.map((record) => (
                        <LedgerRow
                          key={record.id}
                          record={record}
                          registry={registry}
                          selected={false}
                          onSelect={() => openRecordInLedger(record.id)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}

                {activeGroup.records.length === 0 ? (
                  <p className="context-empty-records">
                    아직 이 프로젝트의 기록이 없습니다. 기록을 열고 위쪽에서 프로젝트를 고르면 여기 모입니다.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

        </div>
      )}
    </PageShell>
  );
}

function safeSummaries() {
  try {
    return loadStoredSessionSummaries();
  } catch {
    return [];
  }
}

/**
 * One project in the sidebar, in display or edit mode.
 *
 * Rename and re-parent share one editor because they are one thought ("where
 * does this project sit?"). Neither needs an undo toast the way discard does: a
 * renamed or moved project stays fully visible in this list and can be edited
 * again, so the door back is always open. Only a context-backed group can be
 * edited; a session-only group has no context to rename.
 *
 * The parent options exclude the project itself and its descendants, so the
 * control cannot even offer a move that `reparentContext` would refuse.
 */
function ProjectRow({
  group,
  contexts,
  active,
  showParentPath,
  editing,
  onSelect,
  onStartEdit,
  onCancelEdit,
  onRename,
  onReparent,
}: {
  group: ProjectGroup;
  contexts: KernelContext[];
  active: boolean;
  showParentPath: boolean;
  editing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onRename: (contextId: string, name: string) => Promise<string | null>;
  onReparent: (
    contextId: string,
    parentId: string | undefined,
  ) => Promise<{ parentId: string | undefined } | null>;
}) {
  const context = group.context;
  const [name, setName] = useState(context?.name ?? group.name);
  const [parentId, setParentId] = useState<string | undefined>(context?.parentId);

  const parentOptions = useMemo(() => {
    if (!context) return [];
    return contexts
      .filter((candidate) => candidate.type === "project" && candidate.id !== context.id)
      .filter((candidate) => canReparent(context.id, candidate.id, contexts))
      .map((candidate) => ({ id: candidate.id, path: contextPath(candidate.id, contexts) }))
      .sort((a, b) => a.path.localeCompare(b.path, "ko"));
  }, [context, contexts]);

  if (!editing) {
    return (
      <div className={`context-item-wrap${active ? " is-active" : ""}`}>
        <button
          type="button"
          className={`context-item${active ? " is-active" : ""}`}
          onClick={onSelect}
        >
          <FolderGit2 size={13} aria-hidden="true" />
          <span className="context-item-name">
            {showParentPath ? <span className="context-item-parent">{group.parentPath}/</span> : null}
            {group.name}
          </span>
          <span className="context-item-count">{group.sessions.length + group.records.length}</span>
        </button>
        {context ? (
          <button
            type="button"
            className="context-item-editbtn"
            onClick={onStartEdit}
            aria-label={`${group.name} 이름 변경`}
            title="이름 변경 · 상위 프로젝트"
          >
            <Pencil size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  }

  const commit = async () => {
    if (!context) return;
    const trimmed = name.trim();
    if (trimmed && trimmed !== context.name) await onRename(context.id, trimmed);
    if (parentId !== context.parentId) await onReparent(context.id, parentId);
    onCancelEdit();
  };

  return (
    <form
      className="context-item-edit"
      onSubmit={(event) => {
        event.preventDefault();
        void commit();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="프로젝트 이름"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancelEdit();
        }}
      />
      <select
        value={parentId ?? ""}
        onChange={(event) => setParentId(event.target.value || undefined)}
        aria-label="상위 프로젝트"
      >
        <option value="">최상위</option>
        {parentOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.path}
          </option>
        ))}
      </select>
      <div className="context-item-edit-actions">
        <button type="submit" className="context-item-edit-save" aria-label="저장">
          <Check size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="context-item-edit-cancel"
          onClick={onCancelEdit}
          aria-label="취소"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

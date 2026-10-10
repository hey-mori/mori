/**
 * 프로젝트 · a project reads as everything under it: its notes, its AI sessions,
 * and the records kept out of them. Sessions and records live in two parallel
 * stores; this view merges them by project so the page is filled with the work
 * the user actually has, not an empty kernel-only list.
 *
 * Layout is the house skeleton (기록 v8 §2), the same one 기록 and 세션 use: a
 * 248px rail and a content pane, each topped by the 52px `--workspace-band`.
 * This screen used to sit in PageShell/ActionBar instead, which is why it read
 * as a different app.
 *
 * Left: the project TREE (nesting is real now: `KernelContext.parentId`), with
 * row management behind a hover `⋯` / right-click. Right: the selected
 * project's page (v8 §5), ordered by what a returning user asks first.
 */
import { ProjectChronologySection } from "./ProjectChronologySection";
import { buildProjectChronology } from "../../lib/project/projectChronology";
import { readSessionEvidence } from "../../lib/record-kernel/agentSessionEvidence";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveRestore,
  ClipboardList,
  FolderGit2,
  FolderPlus,
  PenLine,
  Radio,
  Search,
  MessageSquareText,
} from "lucide-react";
import { EmptyState } from "../../components/layout/EmptyState";
import { useAppStore } from "../../app/store";
import { loadStoredSessionSummaries, useSessionStore } from "../../app/sessionStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import { useSessionResolver } from "../session/useSessionResolver";
import { useRecordLedger } from "./useRecordLedger";
import { LedgerRow } from "./LedgerRow";
import { groupRecordsBySection } from "./contextGrouping";
import { buildProjectGroups, sessionKey, type ProjectGroup } from "./projectGroups";
import { loadAutoImportMetas, loadEmptySourceLabels } from "../../lib/session/autoImportMetaStore";
import { autoImportedSessionId } from "../../lib/session/autoImportSessions";
import type { SourceDescriptor } from "../../lib/session/projectSearch";
import { buildProjectSearchInventory } from "../../lib/session/projectSearch";
import { useProjectSearchStore } from "../../app/projectSearchStore";
import { ProjectTranscriptSearch } from "./ProjectTranscriptSearch";
import { loadConnectedProjects } from "../../lib/projects/projectConnection";
import { ledgerVisibleRecords } from "./recordPresentation";
import { archivedRoots, contextPath, contextTreeOrder, inArchivedSubtree } from "./contextTree";
import { ProjectTreeRow, type ProjectTreeNode } from "./ProjectTreeRow";
import { ProjectCreateModal } from "./ProjectCreateModal";
import { ProjectContinuationModal } from "./ProjectContinuationModal";
import { SessionMembershipControl } from "./SessionMembershipControl";
import { buildProjectContinuationPack } from "../../lib/continuation/projectContinuation";
import { ProjectLiveSection } from "./ProjectLiveSection";
import { buildSourceActivity, reportedSessionKeys } from "./sourceActivity";
import { useObservedSessions } from "../live-session/useAmbientObservation";
import { useConfirmedProjectLive, useProjectLive } from "./useProjectLive";
import { confirmedLiveScopeFor } from "./confirmedLiveScope";
import { BaseOverflowMenu } from "../../components/ui/BaseActionMenu";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import { sessionLastActiveAt } from "../../lib/session/sessionActivity";

/** What the rail has selected. A project the user just made holds nothing yet,
 *  so selection keys on the CONTEXT, never on a group that may not exist. */
type Selection = { kind: "context"; id: string } | { kind: "group"; id: string };

export function ContextView() {
  const {
    records,
    registry,
    relations,
    contexts,
    loading,
    renameContext,
    reparentContext,
    createProjectContext,
    archiveContext,
    reviewSessionProject,
  } = useRecordLedger();
  // The door 캘린더 and the command palette already use. 프로젝트 was the only
  // surface that did not, so one note opened as a real document from the
  // calendar and as a 340px textarea from here.
  const openRecordInLedger = useAppStore((state) => state.openRecordInLedger);
  const requestNewRecord = useAppStore((state) => state.requestNewRecord);
  const findInProject = useAppStore((state) => state.findInProject);
  const openSession = useAppStore((state) => state.openSession);
  const resolveSession = useSessionResolver();
  const [summaries] = useState(() => safeSummaries());
  const [connections] = useState(() => loadConnectedProjects());

  const [selection, setSelection] = useState<Selection | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const closeContinuation = useCallback(() => setContinuing(false), []);
  // 이 프로젝트의 대화에서 찾기: open for one project id. A search that is
  // still held for the project (the way back from a result) reopens it.
  const [transcriptSearchFor, setTranscriptSearchFor] = useState<string | null>(
    () => useProjectSearchStore.getState().search?.projectId ?? null,
  );

  const setSessionReturn = useAppStore((state) => state.setSessionReturn);
  const openSessionById = (sessionId: string) => {
    // Remember where it was opened from, for the session's way back.
    setSessionReturn(
      activeContextRef.current
        ? { to: "project", sessionId, contextId: activeContextRef.current.id, label: activeContextRef.current.name, viaSearch: false }
        : null,
    );
    void resolveSession(sessionId).then((outcome) => {
      if (outcome === "opened") openSession("flow");
      // No transcript, import or kept copy to open (its source is gone):
      // show the session's record, what Mori still knows, as the palette
      // does, rather than dropping the user on the live feed.
      else if (outcome === "unavailable") openRecordInLedger(sessionId);
    });
  };

  const groups = useMemo(
    () =>
      buildProjectGroups(
        mergeDemoSessionSummaries(summaries),
        contexts,
        ledgerVisibleRecords(records),
        relations,
        // Aliases the user confirmed (ProjectView's connection review).
        connections,
      ),
    [summaries, contexts, records, relations, connections],
  );

  // Projects a session can be filed under by hand, and the sessions that have a
  // kernel record to file (auto-imported agent sessions).
  const liveProjects = useMemo(
    () =>
      contexts.filter(
        (context) => context.type === "project" && !inArchivedSubtree(context.id, contexts),
      ),
    [contexts],
  );
  const agentSessionIds = useMemo(
    () => new Set(records.filter((record) => record.schemaId === "agent-session").map((record) => record.id)),
    [records],
  );

  const groupByContextId = useMemo(() => {
    const map = new Map<string, ProjectGroup>();
    for (const group of groups) if (group.context) map.set(group.context.id, group);
    return map;
  }, [groups]);

  /** The tree covers every project context, INCLUDING empty ones: a project you
   *  just created is a place you can file into, so it has to be visible. Only
   *  groups drop when empty; the tree does not. */
  const tree = useMemo<ProjectTreeNode[]>(() => {
    const projects = contexts.filter(
      (context) => context.type === "project" && !inArchivedSubtree(context.id, contexts),
    );
    const childCount = new Map<string, number>();
    for (const project of projects) {
      if (project.parentId) childCount.set(project.parentId, (childCount.get(project.parentId) ?? 0) + 1);
    }
    return contextTreeOrder(projects).map(({ context, depth }) => {
      const group = groupByContextId.get(context.id);
      return {
        context,
        depth,
        // Roll-up: groupRecordsByContext already folds descendants in.
        count: group ? group.sessions.length + group.records.length : 0,
        hasChildren: (childCount.get(context.id) ?? 0) > 0,
      };
    });
  }, [contexts, groupByContextId]);

  /** Sessions whose folder leaf matches no context. Real work, not yet a
   *  project: listed apart so the tree stays the user's own structure. */
  const linkedFolders = useMemo(() => groups.filter((group) => !group.context), [groups]);

  const archived = useMemo(
    () => archivedRoots(contexts.filter((context) => context.type === "project")),
    [contexts],
  );

  const visibleTree = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (node: ProjectTreeNode) =>
      !needle || contextPath(node.context.id, contexts).toLowerCase().includes(needle);
    // A collapsed ancestor hides its subtree; searching ignores collapse, since
    // a hit the user cannot see is the same as no hit.
    const hidden = new Set<string>();
    return tree.filter((node) => {
      if (needle) return matches(node);
      const parentId = node.context.parentId;
      if (parentId && (hidden.has(parentId) || collapsed.has(parentId))) {
        hidden.add(node.context.id);
        return false;
      }
      return true;
    });
  }, [tree, collapsed, query, contexts]);

  const filteredFolders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? linkedFolders.filter((group) => group.name.toLowerCase().includes(needle))
      : linkedFolders;
  }, [linkedFolders, query]);

  // Keep a valid selection as data changes, and default to the busiest project.
  //
  // A selection is valid when the context EXISTS, not when it is in the visible
  // tree. Checking the tree looked equivalent and was a crash: the tree hides an
  // archived subtree, so archiving the busiest (or only) project made the
  // selection "invalid", and the repair below picked that same archived project
  // straight back out of `groups` (which does not filter archived) as a FRESH
  // object every run. Object.is never bailed, the effect depends on `selection`,
  // and 프로젝트 died with "Maximum update depth exceeded". It also made 보관됨
  // unusable, since clicking an archived project was undone on the next tick.
  useEffect(() => {
    const stillValid =
      selection?.kind === "context"
        ? contexts.some((context) => context.id === selection.id)
        : selection?.kind === "group"
          ? groups.some((group) => group.id === selection.id)
          : false;
    if (stillValid) return;
    // Only a project the user can actually see is a sane default to land on.
    const visible = groups.find(
      (group) => group.context && !inArchivedSubtree(group.context.id, contexts),
    );
    if (visible?.context) setSelection({ kind: "context", id: visible.context.id });
    else if (groups.length > 0) setSelection({ kind: "group", id: groups[0].id });
    else if (tree.length > 0) setSelection({ kind: "context", id: tree[0].context.id });
    else setSelection(null);
  }, [tree, groups, contexts, selection]);

  // A link that named a reviewed project (the session breadcrumb) lands on that
  // project by its context id. It runs after the default above, so the request
  // wins; an id that no longer resolves leaves the default, never a similarly
  // named project.
  const projectContextFocus = useAppStore((state) => state.projectContextFocus);
  const clearProjectContextFocus = useAppStore((state) => state.clearProjectContextFocus);
  useEffect(() => {
    if (!projectContextFocus || loading) return;
    if (contexts.some((context) => context.id === projectContextFocus && context.type === "project")) {
      setSelection({ kind: "context", id: projectContextFocus });
    }
    clearProjectContextFocus();
  }, [projectContextFocus, loading, contexts, clearProjectContextFocus]);

  const activeContext = useMemo(
    () =>
      selection?.kind === "context"
        ? (contexts.find((context) => context.id === selection.id) ?? null)
        : null,
    [selection, contexts],
  );
  // The selected project for handlers declared above it (openSessionById).
  const activeContextRef = useRef(activeContext);
  activeContextRef.current = activeContext;
  const activeGroup = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "group") return groups.find((group) => group.id === selection.id) ?? null;
    return groupByContextId.get(selection.id) ?? null;
  }, [selection, groups, groupByContextId]);

  const children = useMemo(
    () =>
      activeContext
        ? tree.filter((node) => node.context.parentId === activeContext.id)
        : [],
    [tree, activeContext],
  );

  // The confirmed sessions of the selected project, from the records and
  // contexts the page holds now. Recomputed when membership changes, so a
  // running search stops reading a session that left the project.
  const searchInventory = useMemo(() => {
    if (!activeContext) return null;
    const summaryById = new Map(summaries.map((summary) => [summary.sessionId, summary]));
    return buildProjectSearchInventory({
      projectId: activeContext.id,
      contexts,
      records,
      descriptorOf: descriptorLookup(),
      sessionOf: (sessionId) => {
        const summary = summaryById.get(sessionId);
        return summary ? { title: summary.title, lastActiveAt: sessionLastActiveAt(summary) } : null;
      },
    });
  }, [activeContext, contexts, records, summaries]);
  const restrictProjectSearch = useProjectSearchStore((state) => state.restrict);
  const stopProjectSearch = useProjectSearchStore((state) => state.stop);
  const closeProjectSearch = useProjectSearchStore((state) => state.close);
  const projectSearchId = useProjectSearchStore((state) => state.search?.projectId ?? null);
  useEffect(() => {
    // While the kernel is still loading, the page holds no records yet: that is
    // not "every session left the project", so nothing is restricted.
    if (!projectSearchId || loading) return;
    // Recompute the scope for the searched project itself, whatever is selected.
    const scoped =
      searchInventory?.kind === "ok" && searchInventory.projectId === projectSearchId
        ? searchInventory
        : buildProjectSearchInventory({
            projectId: projectSearchId,
            contexts,
            records,
            descriptorOf: descriptorLookup(),
          });
    restrictProjectSearch(
      projectSearchId,
      new Set(scoped.kind === "ok" ? scoped.entries.map((entry) => entry.sessionId) : []),
    );
  }, [projectSearchId, loading, searchInventory, contexts, records, restrictProjectSearch]);
  // Selecting another project stops the scan (what it found stays for the
  // way back); leaving 프로젝트 does too.
  useEffect(() => {
    if (projectSearchId && activeContext && activeContext.id !== projectSearchId) stopProjectSearch();
  }, [projectSearchId, activeContext, stopProjectSearch]);
  useEffect(() => () => useProjectSearchStore.getState().stop(), []);
  const unconfirmedInGroup = useMemo(() => {
    if (!activeGroup || searchInventory?.kind !== "ok") return 0;
    const confirmed = new Set(searchInventory.entries.map((entry) => entry.sessionId));
    return activeGroup.sessions.filter((session) => !confirmed.has(session.sessionId)).length;
  }, [activeGroup, searchInventory]);

  const parentPath = useMemo(() => {
    if (!activeContext?.parentId) return "";
    return contextPath(activeContext.parentId, contexts);
  }, [activeContext, contexts]);

  const recordSections = useMemo(
    () => (activeGroup ? groupRecordsBySection(activeGroup.records) : []),
    [activeGroup],
  );
  // 흐름: a project's confirmed sessions (its descendants' included, the same
  // set project search reads) and its records. Not shown for a folder group:
  // there it would only repeat the 세션 list.
  const chronologyInput = useMemo(() => {
    if (!activeGroup || !activeContext || searchInventory?.kind !== "ok") return null;
    const visible = new Map(ledgerVisibleRecords(records).map((record) => [record.id, record]));
    const summaryById = new Map(summaries.map((summary) => [summary.sessionId, summary]));
    const chronology = buildProjectChronology({
      sessions: searchInventory.entries.map((entry) => {
        const record = visible.get(entry.sessionId);
        const evidence = readSessionEvidence(record?.properties?.sessionEvidence);
        const steps = record?.properties?.stepCount;
        return {
          id: entry.sessionId,
          title: summaryById.get(entry.sessionId)?.title ?? entry.title,
          // The transcript's own first and last activity. A session with no
          // record has no observed end: its Mori save time is not activity.
          start: record?.occurredStart ?? summaryById.get(entry.sessionId)?.startedAt,
          end: record?.occurredEnd,
          messages: typeof steps === "number" ? steps : undefined,
          prs: evidence?.prs,
          continuesIn: evidence?.continuesIn,
        };
      }),
      records: activeGroup.records.map((record) => ({
        id: record.id,
        title: record.title,
        schemaId: record.schemaId,
        at: record.occurredStart ?? record.capturedAt,
      })),
    });
    return { chronology };
  }, [activeGroup, activeContext, searchInventory, records, summaries]);

  // 이어가기 reads the page's own session list, so what the page shows and what
  // the pack can cite never disagree. Records come in at EVERY status (the page
  // shows only live ones) so the pack can count what it leaves out.
  const continuationPack = useMemo(() => {
    if (!continuing || !activeGroup) return null;
    const unfiltered =
      buildProjectGroups([], contexts, records, relations).find(
        (group) => group.id === activeGroup.id,
      )?.records ?? [];
    return buildProjectContinuationPack({
      project: { name: activeGroup.name, parentPath: activeGroup.parentPath },
      sessions: activeGroup.sessions.map((session) => ({
        id: session.sessionId,
        title: session.title,
        startedAt: session.startedAt,
        savedAt: session.savedAt,
        inclusion: activeGroup.inclusion[session.sessionId],
      })),
      records: unfiltered,
      kernelRecordsById: new Map(records.map((record) => [record.id, record])),
      // Empty sources were never registered, so they are counted by the same
      // leaf key a session joins its project by.
      nameCandidates: activeGroup.candidates.length,
      emptySources: loadEmptySourceLabels().filter(
        (label) => sessionKey(label) === activeGroup.name.trim().toLowerCase(),
      ).length,
      now: new Date(),
    });
  }, [continuing, activeGroup, contexts, records, relations]);

  const title = activeContext?.name ?? activeGroup?.name ?? "";
  // A reviewed project's 현재 상황 follows its confirmed sessions, wherever
  // their agents worked: membership picks the sessions, their observed rows
  // say what happened and how long ago. Nothing is read while the kernel is
  // loading, since an empty member list then means "not known yet".
  const liveSources = useMemo(() => {
    const sessionIdByPath = new Map<string, string>();
    if (activeContext && !loading) {
      for (const meta of loadAutoImportMetas()) {
        if (meta.sourceFilePath) sessionIdByPath.set(meta.sourceFilePath, autoImportedSessionId(meta));
      }
    }
    return confirmedLiveScopeFor({
      project: activeContext,
      loading,
      inventory: searchInventory,
      records,
      contexts,
      sessionIdOfFile: (key) => sessionIdByPath.get(key),
    });
  }, [activeContext, loading, searchInventory, records, contexts]);
  // When each session's conversation last moved, by source file, as discovery
  // last read it (`lastMessageAt`: the last user or assistant record, not the
  // bookkeeping the agent writes while nobody talks). A session the live feed
  // is reporting on is never set aside: its rows are what Mori sees.
  const { feed: observedFeed } = useObservedSessions();
  const reportedKeys = useMemo(() => reportedSessionKeys(observedFeed), [observedFeed]);
  const sourceActivity = useMemo(() => {
    const summaryById = new Map(summaries.map((summary) => [summary.sessionId, summary]));
    return buildSourceActivity({
      metas: loadAutoImportMetas(),
      reportedKeys,
      titleOfMeta: (meta) => summaryById.get(autoImportedSessionId(meta))?.title,
    });
    // Re-read as the poller publishes, so a session discovered since is known.
  }, [summaries, reportedKeys]);
  const sourceActiveAt = sourceActivity.activeAt;
  const confirmedLive = useConfirmedProjectLive(liveSources?.scope ?? null, sourceActiveAt);
  // A folder group has no reviewed membership: it is matched by the folder's
  // display leaf and refused when two observed folders share it (see
  // `selectProjectPathForLabel`).
  const folderLive = useProjectLive(activeContext ? null : title || null, sourceActiveAt);
  const live = activeContext ? confirmedLive.projection : folderLive;
  // A live request names its session by file; the session list knows it by
  // its Mori id. A reviewed project maps through its own members (a file two
  // members name opens neither); a folder group through the descriptors.
  const sessionIdByFile = useMemo(() => {
    if (activeContext) return liveSources?.sessionByKey ?? new Map<string, string | null>();
    const map = new Map<string, string | null>();
    for (const meta of loadAutoImportMetas()) {
      const id = autoImportedSessionId(meta);
      if (meta.filePath) map.set(meta.filePath, id);
      if (meta.sourceFilePath) map.set(meta.sourceFilePath, id);
    }
    return map;
    // Re-read when the live projection changes (a poll may discover a session).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext, liveSources, folderLive]);
  // A live row opens its session at the agent's latest reply, the part a
  // waiting request waits on; if that cannot be read, the ordinary open.
  const liveOpenSequence = useRef(0);
  const openLiveSession = (sessionKey: string) => {
    const sessionId = sessionIdByFile.get(sessionKey);
    if (!sessionId) return null;
    return () => {
      const sequence = ++liveOpenSequence.current;
      setSessionReturn(
        activeContextRef.current
          ? { to: "project", sessionId, contextId: activeContextRef.current.id, label: activeContextRef.current.name, viaSearch: false }
          : null,
      );
      void useSessionStore
        .getState()
        .openSessionAtLatestReply({ sessionId, sourcePath: sessionKey, stillWanted: () => sequence === liveOpenSequence.current })
        .then((outcome) => {
          if (outcome === "opened") openSession("flow");
          else if (outcome !== "superseded") openSessionById(sessionId);
        });
    };
  };
  const count = activeGroup ? activeGroup.sessions.length + activeGroup.records.length : 0;
  const isEmpty = !loading && tree.length === 0 && linkedFolders.length === 0;

  /** Turn a connected folder into a real project. Nothing is moved: once the
   *  context exists, its leaf has exactly one owner, so buildProjectGroups joins
   *  the sessions to it on the next read (the exact-path rule). */
  const adoptFolder = async (name: string) => {
    const created = await createProjectContext(name);
    if (created) setSelection({ kind: "context", id: created.id });
  };

  // The parent goes through by ID. Deriving its path and re-parsing the string
  // resolved it by NAME, so a child under the second of two same-named projects
  // landed under the first.
  const submitCreate = async (name: string, parentId: string | undefined) => {
    setCreating(null);
    const created = await createProjectContext(name, parentId);
    if (created) setSelection({ kind: "context", id: created.id });
  };

  return (
    <div className="ctx-workspace">
      <aside className="ctx-rail" aria-label="프로젝트 목록">
        <div className="ctx-rail-band">
          <div className="base-search-field ctx-rail-search">
            <Search size={13} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="프로젝트 검색"
              aria-label="프로젝트 검색"
            />
          </div>
          <button
            type="button"
            className="ctx-rail-new"
            onClick={() => setCreating({ parentId: null })}
            aria-label="새 프로젝트"
            title="새 프로젝트 · 회사/mori 처럼 적으면 하위로 만듭니다"
          >
            <FolderPlus size={15} aria-hidden="true" />
          </button>
        </div>

        <div
          className={`ctx-rail-body base-scroll${dragging ? " is-dragging" : ""}`}
          onDragOver={(event) => {
            if (dragging) event.preventDefault();
          }}
          onDrop={(event) => {
            // Only a drop on the blank area itself, not one that bubbled up from
            // a row that already handled it.
            if (event.target !== event.currentTarget || !dragging) return;
            void reparentContext(dragging, undefined);
            setDragging(null);
          }}
        >
          {visibleTree.map((node) => (
            <ProjectTreeRow
              key={node.context.id}
                node={node}
                contexts={contexts}
                active={selection?.kind === "context" && selection.id === node.context.id}
                expanded={!collapsed.has(node.context.id)}
                onSelect={() => setSelection({ kind: "context", id: node.context.id })}
                onToggleExpand={() =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(node.context.id)) next.delete(node.context.id);
                    else next.add(node.context.id);
                    return next;
                  })
                }
                onRename={renameContext}
                onReparent={reparentContext}
                onCreateChild={(parentId) => {
                  setCollapsed((current) => {
                    const next = new Set(current);
                    next.delete(parentId);
                    return next;
                  });
                  setCreating({ parentId });
                }}
                onArchive={(contextId) => void archiveContext(contextId, true)}
                dragging={dragging}
              onDragStart={setDragging}
              onDragEnd={() => setDragging(null)}
            />
          ))}

          {archived.length > 0 && !query ? (
            <details className="ctx-archived">
              <summary>보관됨 {archived.length}개</summary>
              {archived.map((context) => (
                <div key={context.id} className="ctx-tree-row is-archived">
                  <button
                    type="button"
                    className="ctx-tree-main"
                    onClick={() => setSelection({ kind: "context", id: context.id })}
                  >
                    <span className="ctx-tree-caret is-empty" aria-hidden="true" />
                    <FolderGit2 size={13} aria-hidden="true" className="ctx-tree-icon" />
                    <span className="ctx-tree-name">{contextPath(context.id, contexts)}</span>
                  </button>
                  <button
                    type="button"
                    className="ctx-tree-restore"
                    onClick={() => void archiveContext(context.id, false)}
                    aria-label={`${context.name} 복원`}
                    title="복원"
                  >
                    <ArchiveRestore size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </details>
          ) : null}

          {filteredFolders.length > 0 ? (
            <>
              {/* Real work that is not yet a project: a session's folder leaf
                  matched no context. Kept apart so the tree above stays the
                  structure the user actually chose. */}
              <p className="ctx-rail-divider">연동 폴더</p>
              {filteredFolders.map((group) => (
                <div
                  key={group.id}
                  className={`ctx-tree-row${
                    selection?.kind === "group" && selection.id === group.id ? " is-active" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="ctx-tree-main"
                    onClick={() => setSelection({ kind: "group", id: group.id })}
                  >
                    <span className="ctx-tree-caret is-empty" aria-hidden="true" />
                    <FolderGit2 size={13} aria-hidden="true" className="ctx-tree-icon is-linked" />
                    <span className="ctx-tree-name">
                      {group.parentPath ? <span className="ctx-tree-parent">{group.parentPath}/</span> : null}
                      {group.name}
                    </span>
                    <span className="ctx-tree-count">
                      {group.sessions.length + group.records.length}
                    </span>
                  </button>
                  <BaseOverflowMenu
                    className="ctx-tree-menu"
                    label={`${group.name} 관리`}
                    items={[
                      {
                        id: "adopt",
                        label: "프로젝트로 만들기",
                        icon: FolderPlus,
                        onSelect: () => void adoptFolder(group.name),
                      },
                    ]}
                  />
                </div>
              ))}
            </>
          ) : null}
        </div>
      </aside>

      <div className="ctx-pane">
        <header className="ctx-pane-band">
          {parentPath ? <span className="ctx-pane-crumb">{parentPath} /</span> : null}
          <h2 className="ctx-pane-title">{title}</h2>
          {count > 0 ? <span className="ctx-pane-count">{count}건</span> : null}
          <span className="ctx-pane-sp" />
          {activeGroup ? (
            <button type="button" className="ctx-pane-new" onClick={() => setContinuing(true)}>
              <ClipboardList size={13} aria-hidden="true" />
              이어가기
            </button>
          ) : null}
          {activeContext ? (
            <button
              type="button"
              className="ctx-pane-new"
              onClick={() =>
                setTranscriptSearchFor((current) => (current === activeContext.id ? null : activeContext.id))
              }
              aria-expanded={transcriptSearchFor === activeContext.id}
              title="이 프로젝트에 확정한 세션의 원본 대화에서 찾습니다"
            >
              <MessageSquareText size={13} aria-hidden="true" />
              대화에서 찾기
            </button>
          ) : null}
          {activeContext ? (
            <button
              type="button"
              className="ctx-pane-new"
              onClick={() => findInProject(activeContext.id)}
              title="이 프로젝트에 확정된 기록과 세션만 찾습니다"
            >
              <Search size={13} aria-hidden="true" />
              이 프로젝트에서 찾기
            </button>
          ) : null}
          {activeContext ? (
            <button
              type="button"
              className="ctx-pane-new"
              onClick={() => requestNewRecord(activeContext.id)}
            >
              <PenLine size={13} aria-hidden="true" />
              새 기록
            </button>
          ) : null}
        </header>

        <div className="ctx-pane-body base-scroll">
          {isEmpty ? (
            <EmptyState
              icon={FolderGit2}
              title="아직 프로젝트가 없습니다"
              description="새 프로젝트를 만들거나, 기록을 열고 위쪽에서 프로젝트를 고르면 여기 모입니다."
            />
          ) : (
            <div className="ctx-pane-inner">
              {activeContext && transcriptSearchFor === activeContext.id && searchInventory?.kind === "ok" ? (
                <ProjectTranscriptSearch
                  key={activeContext.id}
                  inventory={searchInventory}
                  unconfirmed={unconfirmedInGroup}
                  contextLabel={(contextId) => contextPath(contextId, contexts)}
                  onOpened={(sessionId) => {
                    setSessionReturn({ to: "project", sessionId, contextId: activeContext.id, label: activeContext.name, viaSearch: true });
                    openSession("flow");
                  }}
                  onClose={() => {
                    closeProjectSearch();
                    setTranscriptSearchFor(null);
                  }}
                />
              ) : null}
              <ProjectLiveSection
                projection={live}
                openSession={openLiveSession}
                unconfirmedObserved={activeContext ? confirmedLive.unconfirmedObserved : 0}
                sessionTitleOf={sourceActivity.titleOf}
              />
              {children.length > 0 ? (
                <section className="ctx-section">
                  <p className="ctx-section-label">하위 프로젝트</p>
                  <div className="ctx-children">
                    {children.map((child) => (
                      <button
                        key={child.context.id}
                        type="button"
                        className="ctx-child"
                        onClick={() => setSelection({ kind: "context", id: child.context.id })}
                      >
                        <FolderGit2 size={12} aria-hidden="true" />
                        <span className="ctx-child-name">{child.context.name}</span>
                        <span className="ctx-child-count">{child.count}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {chronologyInput ? (
                <ProjectChronologySection
                  key={activeGroup?.id ?? ""}
                  chronology={chronologyInput.chronology}
                  leftOut={unconfirmedInGroup}
                  kindLabel={(schemaId) => registry.get(schemaId)?.name ?? "기록"}
                  onOpenSession={openSessionById}
                  onOpenRecord={openRecordInLedger}
                />
              ) : null}

              {activeGroup && activeGroup.sessions.length > 0 ? (
                <section className="ctx-section">
                  <p className="ctx-section-label">
                    세션
                    <span className="ctx-section-count">{activeGroup.sessions.length}</span>
                  </p>
                  <ul className="context-session-list">
                    {activeGroup.sessions.map((session) => (
                      <li key={session.sessionId} className="context-session-item">
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
                            {formatClaudeRelativeKo(sessionLastActiveAt(session))}
                          </span>
                        </button>
                        <SessionMembershipControl
                          sessionId={session.sessionId}
                          inclusion={activeGroup.inclusion[session.sessionId]}
                          project={activeGroup.context}
                          projects={liveProjects}
                          filable={agentSessionIds.has(session.sessionId)}
                          ledger={{ reviewSessionProject }}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {recordSections.map((section) => (
                <section key={section.id} className="ctx-section">
                  <p className="ctx-section-label">
                    {section.label}
                    <span className="ctx-section-count">{section.records.length}</span>
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

              {activeContext && count === 0 && children.length === 0 ? (
                <p className="ctx-pane-empty">
                  아직 이 프로젝트에 기록이 없습니다. 새 기록을 쓰면 여기 모입니다.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {continuationPack ? (
        <ProjectContinuationModal
          pack={continuationPack}
          onClose={closeContinuation}
          onOpenRef={(ref) => {
            setContinuing(false);
            if (ref.kind === "session") openSessionById(ref.id);
            else openRecordInLedger(ref.id);
          }}
        />
      ) : null}

      {creating ? (
        <ProjectCreateModal
          contexts={contexts}
          initialParentId={creating.parentId}
          onSubmit={(name, parentId) => void submitCreate(name, parentId)}
          onClose={() => setCreating(null)}
        />
      ) : null}
    </div>
  );
}

/** Each discovered session's source descriptor by session id, read once. */
function descriptorLookup(): (sessionId: string) => SourceDescriptor | null {
  const byId = new Map(
    loadAutoImportMetas().map((meta) => [
      autoImportedSessionId(meta),
      { agentName: meta.agentName, importKind: meta.importKind, sourcePath: meta.sourceFilePath ?? null },
    ]),
  );
  return (sessionId) => byId.get(sessionId) ?? null;
}

function safeSummaries(): StoredSessionSummary[] {
  try {
    return loadStoredSessionSummaries();
  } catch {
    return [];
  }
}

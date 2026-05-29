import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  FolderKanban,
  GripVertical,
  LayoutGrid,
  ListTree,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCcw,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { Button } from "../../components/ui/Button";
import { ToolbarSearch } from "../../components/ui/ToolbarSearch";
import { useAppStore } from "../../app/store";
import {
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import {
  buildSessionsBrowserModel,
  type SessionRow,
} from "../../lib/workspace/sessionsBrowser";

/**
 * Workbench — the session-axis surface of the four-tab IA.
 *
 * The user composes their own working layout: an empty canvas to start, then
 * they pull sessions into it as resizable columns and stack panels inside a
 * column. Panels split in any direction from edge "+" affordances, can be
 * dragged between columns, and the whole arrangement persists (and can be saved
 * as a named preset). Each panel shows the session's real conversation flow or
 * a compact timeline. The shared command bar at the bottom targets the focused
 * panel; sending stays honestly disabled until a live agent connector exists —
 * Mori never pretends to drive an agent. Everything is read from already-
 * imported local data; nothing here is live or fabricated.
 */

type PanelMode = "conversation" | "timeline";
type EdgeSide = "top" | "right" | "bottom" | "left";

type Panel = { id: string; sessionId: string; mode: PanelMode; flex: number };
type Column = { id: string; flex: number; panels: Panel[] };
type WorkbenchPreset = { id: string; name: string; columns: Column[] };

type LauncherTarget =
  | { kind: "newColumn"; index: number }
  | { kind: "panelInColumn"; columnId: string; index: number }
  | { kind: "replace"; panelId: string };

type SessionMeta = SessionRow & {
  eventCount: number;
  tokenTotal: number;
  openIssues: number;
  unconfirmedDecisions: number;
  pendingNextActions: number;
};

type ConversationEvent = {
  id: string;
  actor: string;
  title: string;
  summary: string;
  at: string;
};

const MIN_FLEX = 0.3;

const EDGE_LABEL: Record<EdgeSide, string> = {
  top: "위에 패널 추가",
  right: "오른쪽에 열 추가",
  bottom: "아래에 패널 추가",
  left: "왼쪽에 열 추가",
};

export function WorkbenchView() {
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const draft = useSessionStore((state) => state.draft);
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const loadBrowserSession = useSessionStore((state) => state.loadBrowserSession);
  const openSession = useAppStore((state) => state.openSession);
  const navigate = useAppStore((state) => state.navigate);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const activeSessionId = draft?.session.id ?? view.session.id;

  const [columns, setColumns] = useState<Column[]>(() => loadLayout());
  const [launcher, setLauncher] = useState<LauncherTarget | null>(null);
  const [focusedPanelId, setFocusedPanelId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dragPanelId, setDragPanelId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [presets, setPresets] = useState<WorkbenchPreset[]>(() => loadPresets());
  const [manageOpen, setManageOpen] = useState(false);
  const [nameModal, setNameModal] = useState<
    { mode: "save" } | { mode: "rename"; id: string; current: string } | null
  >(null);
  const idRef = useRef(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nextId = (prefix: string) =>
    `${prefix}-${Date.now().toString(36)}-${(idRef.current += 1)}`;

  // Persist the working layout (last state) and saved presets across restarts.
  useEffect(() => {
    saveLayout(columns);
  }, [columns]);
  useEffect(() => {
    savePresets(presets);
  }, [presets]);

  const storedSessions = useMemo(
    () => mergeDemoSessionSummaries(repository.listStoredSessions()),
    [repository],
  );

  const browserModel = useMemo(
    () =>
      buildSessionsBrowserModel({
        active: {
          sessionId: activeSessionId,
          title: view.session.title,
          status: view.session.status,
          sourceLabel: view.session.sourceLabel?.trim() || null,
          startedAt: view.session.startedAt || null,
          endedAt: view.session.endedAt || null,
          isDemo: mode === "demo",
          isStored: Boolean(draft),
        },
        storedSessions,
        filters: { query: "", origin: "all", sort: "recent" },
      }),
    [activeSessionId, draft, mode, storedSessions, view],
  );

  const sessions = useMemo(
    () =>
      buildSessionMeta({
        rows: browserModel.groups.flatMap((group) => group.sessions),
        storedSessions,
        repository,
      }),
    [browserModel.groups, repository, storedSessions],
  );
  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.sessionId, session])),
    [sessions],
  );

  // Drop panels whose session no longer exists; remove emptied columns.
  useEffect(() => {
    const valid = new Set(sessions.map((session) => session.sessionId));
    setColumns((cols) => {
      let changed = false;
      const next = cols
        .map((col) => {
          const panels = col.panels.filter((panel) => valid.has(panel.sessionId));
          if (panels.length !== col.panels.length) changed = true;
          return { ...col, panels };
        })
        .filter((col) => col.panels.length > 0);
      return changed || next.length !== cols.length ? next : cols;
    });
  }, [sessions]);

  const panelIds = useMemo(
    () => columns.flatMap((col) => col.panels.map((panel) => panel.id)),
    [columns],
  );

  // Keep a valid focused panel: default to the first, clear when empty.
  useEffect(() => {
    if (panelIds.length === 0) {
      if (focusedPanelId !== null) setFocusedPanelId(null);
    } else if (!focusedPanelId || !panelIds.includes(focusedPanelId)) {
      setFocusedPanelId(panelIds[0]!);
    }
  }, [panelIds, focusedPanelId]);

  const placeSession = (sessionId: string) => {
    if (!launcher) return;
    if (launcher.kind === "replace") {
      const panelId = launcher.panelId;
      setColumns((cols) =>
        cols.map((col) => ({
          ...col,
          panels: col.panels.map((panel) =>
            panel.id === panelId ? { ...panel, sessionId } : panel,
          ),
        })),
      );
      setFocusedPanelId(panelId);
    } else if (launcher.kind === "panelInColumn") {
      const panelId = nextId("panel");
      const { columnId, index } = launcher;
      setColumns((cols) =>
        cols.map((col) => {
          if (col.id !== columnId) return col;
          const panels = [...col.panels];
          panels.splice(Math.max(0, Math.min(index, panels.length)), 0, {
            id: panelId,
            sessionId,
            mode: "conversation",
            flex: 1,
          });
          return { ...col, panels };
        }),
      );
      setFocusedPanelId(panelId);
    } else {
      const panelId = nextId("panel");
      const columnId = nextId("col");
      const at = launcher.index;
      setColumns((cols) => {
        const arr = [...cols];
        arr.splice(Math.max(0, Math.min(at, arr.length)), 0, {
          id: columnId,
          flex: 1,
          panels: [{ id: panelId, sessionId, mode: "conversation", flex: 1 }],
        });
        return arr;
      });
      setFocusedPanelId(panelId);
    }
    setLauncher(null);
  };

  const setPanelMode = (panelId: string, panelMode: PanelMode) => {
    setColumns((cols) =>
      cols.map((col) => ({
        ...col,
        panels: col.panels.map((panel) => (panel.id === panelId ? { ...panel, mode: panelMode } : panel)),
      })),
    );
  };

  const removePanel = (panelId: string) => {
    setColumns((cols) =>
      cols
        .map((col) => ({ ...col, panels: col.panels.filter((panel) => panel.id !== panelId) }))
        .filter((col) => col.panels.length > 0),
    );
  };

  const endDrag = () => {
    setDragPanelId(null);
    setDropHint(null);
  };

  // Drop a dragged panel at a precise position within a column (reorder/insert).
  const dropPanelAt = (panelId: string, columnId: string, index: number) => {
    setColumns((cols) => {
      let moved: Panel | null = null;
      let srcIndex = -1;
      let sameColumn = false;
      for (const col of cols) {
        const pi = col.panels.findIndex((panel) => panel.id === panelId);
        if (pi >= 0) {
          moved = col.panels[pi]!;
          srcIndex = pi;
          sameColumn = col.id === columnId;
        }
      }
      if (!moved) return cols;
      const adjusted = sameColumn && index > srcIndex ? index - 1 : index;
      const removed = cols.map((col) => ({
        ...col,
        panels: col.panels.filter((panel) => panel.id !== panelId),
      }));
      const inserted = removed.map((col) => {
        if (col.id !== columnId) return col;
        const panels = [...col.panels];
        panels.splice(Math.max(0, Math.min(adjusted, panels.length)), 0, moved!);
        return { ...col, panels };
      });
      return inserted.filter((col) => col.panels.length > 0);
    });
    setFocusedPanelId(panelId);
    endDrag();
  };

  // Drag a panel into another column (stack) or out to a new column (split).
  const relocatePanel = (
    panelId: string,
    target: { kind: "column"; columnId: string } | { kind: "newColumn"; index: number },
  ) => {
    setColumns((cols) => {
      let moved: Panel | null = null;
      const stripped = cols
        .map((col) => {
          const found = col.panels.find((panel) => panel.id === panelId);
          if (found) moved = found;
          return { ...col, panels: col.panels.filter((panel) => panel.id !== panelId) };
        })
        .filter((col) => col.panels.length > 0);
      if (!moved) return cols;
      if (target.kind === "column") {
        const exists = stripped.some((col) => col.id === target.columnId);
        if (!exists) return [...stripped, { id: nextId("col"), flex: 1, panels: [moved] }];
        return stripped.map((col) =>
          col.id === target.columnId ? { ...col, panels: [...col.panels, moved!] } : col,
        );
      }
      const index = Math.max(0, Math.min(target.index, stripped.length));
      stripped.splice(index, 0, { id: nextId("col"), flex: 1, panels: [moved] });
      return stripped;
    });
    setFocusedPanelId(panelId);
    endDrag();
  };

  const startResize = (index: number) => (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const width = canvasRef.current?.getBoundingClientRect().width ?? 1;
    const startFlex = columns.map((col) => col.flex);
    const sumFlex = startFlex.reduce((sum, value) => sum + value, 0) || 1;
    const onMove = (moveEvent: MouseEvent) => {
      const deltaFlex = ((moveEvent.clientX - startX) / width) * sumFlex;
      setColumns((cols) => {
        if (index < 0 || index + 1 >= cols.length) return cols;
        const pair = startFlex[index]! + startFlex[index + 1]!;
        let left = startFlex[index]! + deltaFlex;
        left = Math.max(MIN_FLEX, Math.min(pair - MIN_FLEX, left));
        const next = cols.map((col) => ({ ...col }));
        next[index] = { ...next[index]!, flex: left };
        next[index + 1] = { ...next[index + 1]!, flex: pair - left };
        return next;
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
  };

  // Resize two vertically-stacked panels within a column.
  const startVResize =
    (columnId: string, panelIndex: number) => (event: React.MouseEvent) => {
      event.preventDefault();
      const startY = event.clientY;
      const colEl = (event.currentTarget as HTMLElement).parentElement;
      const height = colEl?.getBoundingClientRect().height ?? 1;
      const col = columns.find((entry) => entry.id === columnId);
      if (!col) return;
      const startFlex = col.panels.map((panel) => panel.flex);
      const sumFlex = startFlex.reduce((sum, value) => sum + value, 0) || 1;
      const onMove = (moveEvent: MouseEvent) => {
        const deltaFlex = ((moveEvent.clientY - startY) / height) * sumFlex;
        setColumns((cols) =>
          cols.map((entry) => {
            if (entry.id !== columnId || panelIndex + 1 >= entry.panels.length) return entry;
            const pair = startFlex[panelIndex]! + startFlex[panelIndex + 1]!;
            let top = startFlex[panelIndex]! + deltaFlex;
            top = Math.max(MIN_FLEX, Math.min(pair - MIN_FLEX, top));
            const panels = entry.panels.map((panel) => ({ ...panel }));
            panels[panelIndex] = { ...panels[panelIndex]!, flex: top };
            panels[panelIndex + 1] = { ...panels[panelIndex + 1]!, flex: pair - top };
            return { ...entry, panels };
          }),
        );
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      document.body.style.cursor = "row-resize";
    };

  const openInWorkspace = (sessionId: string, isActive: boolean) => {
    if (isActive || loadBrowserSession(sessionId)) openSession("flow");
  };

  // ─── Presets ──────────────────────────────────────────────────────────────
  const applyPreset = (preset: WorkbenchPreset) => setColumns(cloneColumns(preset.columns));
  const deletePreset = (id: string) =>
    setPresets((prev) => prev.filter((preset) => preset.id !== id));
  const renamePreset = (id: string, name: string) =>
    setPresets((prev) => prev.map((preset) => (preset.id === id ? { ...preset, name } : preset)));
  const confirmName = (name: string) => {
    if (!nameModal) return;
    if (nameModal.mode === "save") {
      setPresets((prev) => [...prev, { id: nextId("preset"), name, columns: cloneColumns(columns) }]);
    } else {
      renamePreset(nameModal.id, name);
    }
    setNameModal(null);
  };

  const hasSessions = sessions.length > 0;
  const hasLayout = columns.length > 0;

  const focusedMeta = useMemo(() => {
    if (!focusedPanelId) return null;
    for (const col of columns) {
      const panel = col.panels.find((entry) => entry.id === focusedPanelId);
      if (panel) return sessionsById.get(panel.sessionId) ?? null;
    }
    return null;
  }, [columns, focusedPanelId, sessionsById]);
  const focusedDraft = focusedMeta ? drafts[focusedMeta.sessionId] ?? "" : "";
  const setFocusedDraft = (value: string) => {
    if (!focusedMeta) return;
    setDrafts((current) => ({ ...current, [focusedMeta.sessionId]: value }));
  };
  const hotClass = (key: string) => (dropHint === key ? " is-hot" : "");
  const readDragId = (event: React.DragEvent) => event.dataTransfer.getData("text/plain");

  return (
    <PageShell
      className="workbench-page"
      maxWidth="full"
      actionBar={
        <ActionBar
          label="워크벤치 컨트롤"
          start={
            presets.length > 0 ? (
              <PresetBar presets={presets} onApply={applyPreset} onManage={() => setManageOpen(true)} />
            ) : undefined
          }
          end={
            hasLayout ? (
              <>
                <Button variant="ghost" icon={Trash2} onClick={() => setColumns([])}>
                  비우기
                </Button>
                <Button variant="ghost" icon={Bookmark} onClick={() => setNameModal({ mode: "save" })}>
                  배치 저장
                </Button>
                <Button
                  variant="secondary"
                  icon={Plus}
                  onClick={() => setLauncher({ kind: "newColumn", index: columns.length })}
                >
                  세션 추가
                </Button>
              </>
            ) : null
          }
        />
      }
    >
      {!hasSessions ? (
        <EmptyState
          icon={FolderKanban}
          title="워크벤치에 올릴 세션이 없습니다"
          description="연결에서 작업 기록을 가져오면 세션을 자유롭게 배치할 수 있습니다."
          actions={
            <Button variant="primary" icon={ArrowUpRight} onClick={() => navigate("connections")}>
              연결 열기
            </Button>
          }
        />
      ) : !hasLayout ? (
        <div className="workbench-blank">
          <div className="workbench-blank-card">
            <span className="workbench-blank-icon" aria-hidden="true">
              <LayoutGrid size={24} />
            </span>
            <strong>워크벤치를 구성하세요</strong>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => setLauncher({ kind: "newColumn", index: 0 })}
            >
              세션 추가
            </Button>
            {presets.length > 0 ? (
              <div className="workbench-blank-presets">
                <span>저장된 배치</span>
                <div>
                  {presets.map((preset) => (
                    <button key={preset.id} type="button" onClick={() => applyPreset(preset)}>
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="workbench-surface">
          <div
            className={`workbench-canvas${dragPanelId ? " is-dragging" : ""}`}
            ref={canvasRef}
          >
            <div
              className={`workbench-col-drop is-lead${hotClass("col:0")}`}
              aria-hidden={!dragPanelId}
              onDragOver={(event) => {
                if (!dragPanelId) return;
                event.preventDefault();
                setDropHint("col:0");
              }}
              onDrop={(event) => {
                const id = readDragId(event);
                if (id) relocatePanel(id, { kind: "newColumn", index: 0 });
              }}
            >
              <Plus size={14} aria-hidden="true" />
            </div>
            {columns.map((col, colIndex) => (
              <Fragment key={col.id}>
                <div
                  className="workbench-col"
                  style={{ flexGrow: col.flex, flexBasis: 0 }}
                  onDragOver={(event) => {
                    if (dragPanelId) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    const id = event.dataTransfer.getData("text/plain");
                    if (id) relocatePanel(id, { kind: "column", columnId: col.id });
                  }}
                >
                  {col.panels.map((panel, panelIndex) => {
                    const meta = sessionsById.get(panel.sessionId) ?? null;
                    return (
                      <Fragment key={panel.id}>
                        <SessionPanel
                          panel={panel}
                          meta={meta}
                          repository={repository}
                          flex={panel.flex}
                          focused={panel.id === focusedPanelId}
                          dragging={panel.id === dragPanelId}
                          onFocus={() => setFocusedPanelId(panel.id)}
                          onDragStart={() => setDragPanelId(panel.id)}
                          onDragEnd={endDrag}
                          onEdgeAdd={(side) =>
                            setLauncher(edgeTarget(side, col.id, colIndex, panelIndex))
                          }
                          onMode={(panelMode) => setPanelMode(panel.id, panelMode)}
                          onReplace={() => setLauncher({ kind: "replace", panelId: panel.id })}
                          onClose={() => removePanel(panel.id)}
                          onOpen={() => meta && openInWorkspace(meta.sessionId, meta.isActive)}
                        />
                        {panelIndex < col.panels.length - 1 ? (
                          <div
                            className={`workbench-vgutter${hotClass("vg:" + col.id + ":" + (panelIndex + 1))}`}
                            role="separator"
                            aria-orientation="horizontal"
                            onMouseDown={startVResize(col.id, panelIndex)}
                            onDragOver={(event) => {
                              if (!dragPanelId) return;
                              event.preventDefault();
                              event.stopPropagation();
                              setDropHint("vg:" + col.id + ":" + (panelIndex + 1));
                            }}
                            onDrop={(event) => {
                              event.stopPropagation();
                              const id = readDragId(event);
                              if (id) dropPanelAt(id, col.id, panelIndex + 1);
                            }}
                          />
                        ) : null}
                      </Fragment>
                    );
                  })}
                </div>
                {colIndex < columns.length - 1 ? (
                  <div
                    className={`workbench-gutter${hotClass("col:" + (colIndex + 1))}`}
                    role="separator"
                    aria-orientation="vertical"
                    onMouseDown={startResize(colIndex)}
                    onDragOver={(event) => {
                      if (!dragPanelId) return;
                      event.preventDefault();
                      setDropHint("col:" + (colIndex + 1));
                    }}
                    onDrop={(event) => {
                      const id = readDragId(event);
                      if (id) relocatePanel(id, { kind: "newColumn", index: colIndex + 1 });
                    }}
                  />
                ) : null}
              </Fragment>
            ))}
            {/* Trailing new-column drop target, shown only while dragging a panel. */}
            <div
              className={`workbench-col-drop${hotClass("col:" + columns.length)}`}
              aria-hidden={!dragPanelId}
              onDragOver={(event) => {
                if (!dragPanelId) return;
                event.preventDefault();
                setDropHint("col:" + columns.length);
              }}
              onDrop={(event) => {
                const id = readDragId(event);
                if (id) relocatePanel(id, { kind: "newColumn", index: columns.length });
              }}
            >
              <Plus size={15} aria-hidden="true" />
            </div>
          </div>
          <CommandBar meta={focusedMeta} value={focusedDraft} onChange={setFocusedDraft} />
        </div>
      )}

      {launcher ? (
        <SessionPicker sessions={sessions} onPick={placeSession} onClose={() => setLauncher(null)} />
      ) : null}

      {manageOpen ? (
        <PresetManager
          presets={presets}
          onApply={(preset) => {
            applyPreset(preset);
            setManageOpen(false);
          }}
          onRequestRename={(preset) => setNameModal({ mode: "rename", id: preset.id, current: preset.name })}
          onDelete={deletePreset}
          onClose={() => setManageOpen(false)}
        />
      ) : null}

      {nameModal ? (
        <PromptModal
          title={nameModal.mode === "save" ? "배치 저장" : "배치 이름 변경"}
          initialValue={nameModal.mode === "rename" ? nameModal.current : ""}
          confirmLabel={nameModal.mode === "save" ? "저장" : "변경"}
          onConfirm={confirmName}
          onClose={() => setNameModal(null)}
        />
      ) : null}
    </PageShell>
  );
}

function edgeTarget(
  side: EdgeSide,
  columnId: string,
  columnIndex: number,
  panelIndex: number,
): LauncherTarget {
  switch (side) {
    case "left":
      return { kind: "newColumn", index: columnIndex };
    case "right":
      return { kind: "newColumn", index: columnIndex + 1 };
    case "top":
      return { kind: "panelInColumn", columnId, index: panelIndex };
    case "bottom":
      return { kind: "panelInColumn", columnId, index: panelIndex + 1 };
  }
}

// ─── Session picker (modal) ───────────────────────────────────────────────────

function SessionPicker({
  sessions,
  onPick,
  onClose,
}: {
  sessions: SessionMeta[];
  onPick: (sessionId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? sessions.filter((session) =>
        `${session.title} ${session.sourceLabel ?? ""}`.toLowerCase().includes(needle),
      )
    : sessions;
  const groups = useMemo(() => groupSessions(filtered), [filtered]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="workbench-modal-layer" role="presentation">
      <button type="button" className="workbench-modal-scrim" aria-label="닫기" onClick={onClose} />
      <div className="workbench-modal" role="dialog" aria-modal="true" aria-label="세션 선택">
        <header className="workbench-modal-head">
          <ToolbarSearch value={query} onChange={setQuery} ariaLabel="프로젝트·세션 검색" />
          <Button size="sm" variant="ghost" icon={X} title="닫기" onClick={onClose} />
        </header>
        <div className="workbench-picker-list base-scroll">
          {groups.length === 0 ? (
            <div className="workbench-picker-empty">일치하는 세션이 없습니다</div>
          ) : (
            groups.map((group) => (
              <section className="workbench-picker-group" key={group.key}>
                <header>
                  <FolderKanban size={12} aria-hidden="true" />
                  <span>{group.label}</span>
                  <i>{group.sessions.length}</i>
                </header>
                {group.sessions.map((session) => {
                  const attention =
                    session.openIssues + session.unconfirmedDecisions + session.pendingNextActions;
                  return (
                    <button
                      type="button"
                      key={session.sessionId}
                      className="workbench-picker-row"
                      onClick={() => onPick(session.sessionId)}
                    >
                      <span className="workbench-picker-title">{session.title}</span>
                      <span className="workbench-picker-meta">
                        {session.savedAt ?? session.startedAt
                          ? formatRelative(session.savedAt ?? session.startedAt!)
                          : "기록 없음"}
                        <i>·</i>
                        {session.eventCount}개
                        {attention > 0 ? <em className="workbench-picker-attn">검토 {attention}</em> : null}
                      </span>
                    </button>
                  );
                })}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Preset bar + manager ─────────────────────────────────────────────────────

function PresetBar({
  presets,
  onApply,
  onManage,
}: {
  presets: WorkbenchPreset[];
  onApply: (preset: WorkbenchPreset) => void;
  onManage: () => void;
}) {
  return (
    <div className="workbench-presets" role="group" aria-label="저장된 배치">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="workbench-preset"
          onClick={() => onApply(preset)}
        >
          {preset.name}
        </button>
      ))}
      <button type="button" className="workbench-preset-manage" aria-label="배치 관리" onClick={onManage}>
        <SlidersHorizontal size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function PresetManager({
  presets,
  onApply,
  onRequestRename,
  onDelete,
  onClose,
}: {
  presets: WorkbenchPreset[];
  onApply: (preset: WorkbenchPreset) => void;
  onRequestRename: (preset: WorkbenchPreset) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="workbench-modal-layer" role="presentation">
      <button type="button" className="workbench-modal-scrim" aria-label="닫기" onClick={onClose} />
      <div className="workbench-modal is-narrow" role="dialog" aria-modal="true" aria-label="배치 관리">
        <header className="workbench-modal-head">
          <strong>배치 관리</strong>
          <Button size="sm" variant="ghost" icon={X} title="닫기" onClick={onClose} />
        </header>
        <div className="workbench-manage-list base-scroll">
          {presets.length === 0 ? (
            <div className="workbench-picker-empty">저장된 배치가 없습니다</div>
          ) : (
            presets.map((preset) => (
              <div className="workbench-manage-row" key={preset.id}>
                <button type="button" className="workbench-manage-name" onClick={() => onApply(preset)}>
                  <span>{preset.name}</span>
                  <small>{preset.columns.reduce((sum, col) => sum + col.panels.length, 0)}개 패널</small>
                </button>
                <IconAction icon={Pencil} label="이름 변경" onClick={() => onRequestRename(preset)} />
                <IconAction icon={Trash2} label="삭제" onClick={() => onDelete(preset.id)} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PromptModal({
  title,
  initialValue,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  initialValue: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  };
  return (
    <div className="workbench-modal-layer" role="presentation">
      <button type="button" className="workbench-modal-scrim" aria-label="닫기" onClick={onClose} />
      <div className="workbench-modal is-narrow" role="dialog" aria-modal="true" aria-label={title}>
        <header className="workbench-modal-head">
          <strong>{title}</strong>
          <Button size="sm" variant="ghost" icon={X} title="닫기" onClick={onClose} />
        </header>
        <div className="workbench-prompt">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            aria-label={title}
            placeholder=""
          />
          <div className="workbench-prompt-actions">
            <Button size="sm" variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button size="sm" variant="primary" onClick={submit} disabled={!value.trim()}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Session panel ────────────────────────────────────────────────────────────

function SessionPanel({
  panel,
  meta,
  repository,
  flex,
  focused,
  dragging,
  onFocus,
  onDragStart,
  onDragEnd,
  onEdgeAdd,
  onMode,
  onReplace,
  onClose,
  onOpen,
}: {
  panel: Panel;
  meta: SessionMeta | null;
  repository: ReturnType<typeof createBrowserDraftRepository>;
  flex: number;
  focused: boolean;
  dragging: boolean;
  onFocus: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onEdgeAdd: (side: EdgeSide) => void;
  onMode: (mode: PanelMode) => void;
  onReplace: () => void;
  onClose: () => void;
  onOpen: () => void;
}) {
  const events = useMemo(
    () => (meta ? loadConversation(repository, meta.sessionId) : []),
    [repository, meta],
  );

  if (!meta) {
    return (
      <article className="workbench-panel is-missing" style={{ flexGrow: flex, flexBasis: 0 }}>
        <p>세션을 찾을 수 없습니다.</p>
        <Button size="sm" variant="secondary" onClick={onReplace}>
          다른 세션 선택
        </Button>
      </article>
    );
  }

  return (
    <article
      className={`workbench-panel${focused ? " is-focused" : ""}${dragging ? " is-dragging-self" : ""}`}
      style={{ flexGrow: flex, flexBasis: 0 }}
      aria-label={meta.title}
      onMouseDownCapture={onFocus}
    >
      <header className="workbench-panel-head">
        <span
          className="workbench-panel-grip"
          draggable
          role="button"
          aria-label="패널 이동 (끌어서 다른 열로)"
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", panel.id);
            event.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          <GripVertical size={14} aria-hidden="true" />
        </span>
        <div className="workbench-panel-id">
          <h2 title={meta.title}>{meta.title}</h2>
          <span>
            {meta.sourceLabel ? shortProjectLabel(meta.sourceLabel) : "수동 세션"}
            {meta.savedAt ?? meta.startedAt ? ` · ${formatRelative(meta.savedAt ?? meta.startedAt!)}` : ""}
          </span>
        </div>
        <div className="workbench-panel-actions">
          <span className="workbench-panel-modes" role="group" aria-label="보기 전환">
            <ModeButton icon={MessageSquare} label="대화" active={panel.mode === "conversation"} onClick={() => onMode("conversation")} />
            <ModeButton icon={ListTree} label="타임라인" active={panel.mode === "timeline"} onClick={() => onMode("timeline")} />
          </span>
          <IconAction icon={RefreshCcw} label="세션 교체" onClick={onReplace} />
          <IconAction icon={ArrowUpRight} label="작업 공간에서 열기" onClick={onOpen} />
          <IconAction icon={X} label="패널 닫기" onClick={onClose} />
        </div>
      </header>

      <div className="workbench-panel-body base-scroll">
        {panel.mode === "conversation" ? (
          <ConversationFlow events={events} />
        ) : (
          <TimelineFlow events={events} meta={meta} />
        )}
      </div>

      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <button
          key={side}
          type="button"
          className={`workbench-edge workbench-edge-${side}`}
          aria-label={EDGE_LABEL[side]}
          onClick={(event) => {
            event.stopPropagation();
            onEdgeAdd(side);
          }}
        >
          <Plus size={13} aria-hidden="true" />
        </button>
      ))}
    </article>
  );
}

/**
 * A single command bar shared by the whole workbench, like a terminal prompt:
 * it targets the focused panel's session. Sending stays disabled until a real
 * agent connector exists, since Mori never drives an agent. The typed draft is
 * preserved per session so switching focus does not lose it.
 */
function CommandBar({
  meta,
  value,
  onChange,
}: {
  meta: SessionMeta | null;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <form className="workbench-command" onSubmit={(event) => event.preventDefault()}>
      <span className="workbench-command-target" title={meta?.title}>
        <Send size={12} aria-hidden="true" />
        <span>{meta ? meta.title : "패널을 선택하세요"}</span>
      </span>
      <input
        type="text"
        className="workbench-command-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={!meta}
        aria-label={meta ? `${meta.title} 요청 입력` : "요청 입력"}
        placeholder={meta ? "요청을 입력하세요" : ""}
      />
      <span className="workbench-command-hint">연결 대기</span>
      <Button
        size="sm"
        variant="secondary"
        icon={Send}
        disabled
        title="실제 에이전트 연결이 준비되면 선택한 세션으로 요청을 보낼 수 있습니다."
      />
    </form>
  );
}

function ConversationFlow({ events }: { events: ConversationEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="workbench-flow-empty">
        <MessageSquare size={15} aria-hidden="true" />
        <span>대화 기록이 없습니다</span>
      </div>
    );
  }
  return (
    <div className="workbench-conversation">
      {events.map((event) => {
        const user = isUserActor(event.actor);
        return (
          <div className={`workbench-msg${user ? " is-user" : ""}`} key={event.id}>
            <div className="workbench-msg-meta">
              <span className="workbench-msg-actor">{user ? "나" : event.actor}</span>
              {event.at ? <time>{formatRelative(event.at)}</time> : null}
            </div>
            <div className="workbench-msg-bubble">
              <strong>{event.title}</strong>
              {event.summary ? <p>{event.summary}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineFlow({ events, meta }: { events: ConversationEvent[]; meta: SessionMeta }) {
  return (
    <div className="workbench-timeline">
      <div className="workbench-timeline-stats">
        <Stat label="항목" value={meta.eventCount} />
        <Stat label="이슈" value={meta.openIssues} tone={meta.openIssues > 0 ? "warning" : "neutral"} />
        <Stat label="결정" value={meta.unconfirmedDecisions} />
        <Stat label="다음" value={meta.pendingNextActions} />
      </div>
      {events.length === 0 ? (
        <div className="workbench-flow-empty">
          <ListTree size={15} aria-hidden="true" />
          <span>타임라인 이벤트가 없습니다</span>
        </div>
      ) : (
        <ol className="workbench-timeline-list">
          {events.map((event) => (
            <li key={event.id}>
              <span className="workbench-timeline-dot" aria-hidden="true" />
              <div>
                <strong>{event.title}</strong>
                <small>
                  {event.actor}
                  {event.at ? ` · ${formatRelative(event.at)}` : ""}
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ModeButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? "is-active" : ""} aria-pressed={active} aria-label={label} onClick={onClick}>
      <Icon size={13} aria-hidden="true" />
    </button>
  );
}

function IconAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" className="workbench-panel-icon" aria-label={label} onClick={onClick}>
      <Icon size={13} aria-hidden="true" />
    </button>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className={`workbench-stat tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// ─── Derivations ──────────────────────────────────────────────────────────────

const LAYOUT_KEY = "mori.workbench.layout.v1";
const PRESETS_KEY = "mori.workbench.presets.v1";

function cloneColumns(columns: Column[]): Column[] {
  return columns.map((col) => ({ ...col, panels: col.panels.map((panel) => ({ ...panel })) }));
}

function groupSessions(
  sessions: SessionMeta[],
): { key: string; label: string; sessions: SessionMeta[] }[] {
  const order: string[] = [];
  const map = new Map<string, { key: string; label: string; sessions: SessionMeta[] }>();
  for (const session of sessions) {
    const key = session.sourceLabel ?? "__manual__";
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        label: session.sourceLabel ? shortProjectLabel(session.sourceLabel) : "수동 세션",
        sessions: [],
      };
      map.set(key, group);
      order.push(key);
    }
    group.sessions.push(session);
  }
  return order.map((key) => map.get(key)!);
}

/** Shape-validate a stored columns array (the live layout and presets share it). */
function parseColumns(value: unknown): Column[] {
  if (!Array.isArray(value)) return [];
  const columns: Column[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Partial<Column>;
    if (typeof candidate.id !== "string" || !Array.isArray(candidate.panels)) continue;
    const panels: Panel[] = [];
    for (const panel of candidate.panels) {
      if (!panel || typeof panel !== "object") continue;
      const p = panel as Partial<Panel>;
      if (typeof p.id !== "string" || typeof p.sessionId !== "string") continue;
      panels.push({
        id: p.id,
        sessionId: p.sessionId,
        mode: p.mode === "timeline" ? "timeline" : "conversation",
        flex: typeof p.flex === "number" && p.flex > 0 ? p.flex : 1,
      });
    }
    if (panels.length === 0) continue;
    columns.push({
      id: candidate.id,
      flex: typeof candidate.flex === "number" && candidate.flex > 0 ? candidate.flex : 1,
      panels,
    });
  }
  return columns;
}

/** Restore the last working layout, so the workbench survives a restart. */
function loadLayout(): Column[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    return raw ? parseColumns(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Persist the working layout; clearing it when empty. */
function saveLayout(columns: Column[]): void {
  if (typeof window === "undefined") return;
  try {
    if (columns.length === 0) window.localStorage.removeItem(LAYOUT_KEY);
    else window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(columns));
  } catch {
    // Best-effort: a storage failure must never break the workbench.
  }
}

/** Named, reusable arrangements the user can save and reapply. */
function loadPresets(): WorkbenchPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const presets: WorkbenchPreset[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Partial<WorkbenchPreset>;
      if (typeof candidate.id !== "string" || typeof candidate.name !== "string") continue;
      const columns = parseColumns(candidate.columns);
      if (columns.length === 0) continue;
      presets.push({ id: candidate.id, name: candidate.name, columns });
    }
    return presets;
  } catch {
    return [];
  }
}

function savePresets(presets: WorkbenchPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Best-effort.
  }
}

function buildSessionMeta({
  rows,
  storedSessions,
  repository,
}: {
  rows: SessionRow[];
  storedSessions: ReturnType<typeof mergeDemoSessionSummaries>;
  repository: ReturnType<typeof createBrowserDraftRepository>;
}): SessionMeta[] {
  const byId = new Map(storedSessions.map((session) => [session.sessionId, session]));
  return rows.map((row) => {
    const stored = byId.get(row.sessionId);
    const body = safeLoadMemoryBody(repository, row.sessionId);
    return {
      ...row,
      eventCount: stored?.eventCount ?? 0,
      tokenTotal: stored?.tokenTotal ?? 0,
      openIssues: body?.issues.filter((issue) => issue.status === "open").length ?? 0,
      unconfirmedDecisions: body?.decisions.filter((decision) => !decision.confirmed).length ?? 0,
      pendingNextActions: body?.nextActions.filter((action) => !action.done).length ?? 0,
    };
  });
}

function loadConversation(
  repository: ReturnType<typeof createBrowserDraftRepository>,
  sessionId: string,
): ConversationEvent[] {
  try {
    return repository
      .listSessionImports(sessionId)
      .flatMap((record) => record.events)
      .slice()
      .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))
      .slice(0, 80)
      .map((event) => ({
        id: event.id,
        actor: event.actor ?? event.type,
        title: event.title,
        summary: event.summary,
        at: event.start,
      }));
  } catch {
    return [];
  }
}

function isUserActor(actor: string): boolean {
  return /user|나|me|human/i.test(actor);
}

function safeLoadMemoryBody(
  repository: ReturnType<typeof createBrowserDraftRepository>,
  sessionId: string,
) {
  try {
    return repository.loadSessionMemoryBody(sessionId);
  } catch {
    return null;
  }
}

function formatRelative(iso: string): string {
  const epoch = new Date(iso).getTime();
  if (Number.isNaN(epoch)) return "";
  const diff = Date.now() - epoch;
  if (diff < 0) return "방금";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  const date = new Date(epoch);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

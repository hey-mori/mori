import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Columns2,
  Command,
  FolderKanban,
  GripVertical,
  LayoutGrid,
  ListTree,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  Rows2,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../app/store";
import {
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import {
  isDemoSessionId,
  mergeDemoSessionSummaries,
} from "../../lib/demo/demoSessionFixtures";
import { buildDemoSessionContent } from "../../lib/demo/demoSessionContent";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import {
  buildSessionsBrowserModel,
  type SessionRow,
} from "../../lib/workspace/sessionsBrowser";
import {
  buildWorkbenchAttention,
  type WorkbenchAttentionItem,
} from "../../lib/workbench/attention";

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

type Panel = {
  id: string;
  sessionId: string;
  mode: PanelMode;
  flex: number;
  collapsed?: boolean;
};
type Density = "comfortable" | "dense";
type QuickLayout = "single" | "columns";
type CommandAction = { id: string; group: string; label: string; run: () => void };
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
  kind: string;
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
  const [density, setDensity] = useState<Density>(() => loadDensity());
  const [launcher, setLauncher] = useState<LauncherTarget | null>(null);
  const [focusedPanelId, setFocusedPanelId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dragPanelId, setDragPanelId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [presets, setPresets] = useState<WorkbenchPreset[]>(() => loadPresets());
  const [manageOpen, setManageOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [search, setSearch] = useState("");
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
  useEffect(() => {
    saveDensity(density);
  }, [density]);

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

  const addSessionToNewColumn = (sessionId: string) => {
    const panelId = nextId("panel");
    setColumns((cols) => [
      ...cols,
      { id: nextId("col"), flex: 1, panels: [{ id: panelId, sessionId, mode: "conversation", flex: 1 }] },
    ]);
    setFocusedPanelId(panelId);
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

  const toggleCollapse = (panelId: string) => {
    setColumns((cols) =>
      cols.map((col) => ({
        ...col,
        panels: col.panels.map((panel) =>
          panel.id === panelId ? { ...panel, collapsed: !panel.collapsed } : panel,
        ),
      })),
    );
  };

  // Reflow every placed panel into a canonical arrangement (single column, two
  // columns, or a balanced grid), resetting sizes. A fast way to reset a layout
  // that drifted during free composition.
  const applyQuickLayout = (shape: QuickLayout) => {
    setColumns((cols) => {
      const panels = cols
        .flatMap((col) => col.panels)
        .map((panel) => ({ ...panel, flex: 1, collapsed: false }));
      if (panels.length === 0) return cols;
      const colCount = shape === "single" ? 1 : Math.min(panels.length, 3);
      const next: Column[] = Array.from({ length: colCount }, () => ({
        id: nextId("col"),
        flex: 1,
        panels: [] as Panel[],
      }));
      panels.forEach((panel, index) => next[index % colCount]!.panels.push(panel));
      return next.filter((col) => col.panels.length > 0);
    });
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

  // Pointer-based panel drag. Native HTML5 drag-and-drop proved unreliable in
  // the app shell, so we track the pointer ourselves: grab the grip, hit-test
  // the drop zones (data-drop) under the cursor on each move, and apply on
  // release. Works with mouse, trackpad, and touch, and never depends on a
  // re-render surviving the gesture.
  const resolveDrop = (
    x: number,
    y: number,
  ): { hint: string; apply: (panelId: string) => void } | null => {
    if (typeof document === "undefined") return null;
    const el = document.elementFromPoint(x, y);
    const zone = el && "closest" in el ? (el as Element).closest("[data-drop]") : null;
    const raw = zone?.getAttribute("data-drop");
    if (!raw) return null;
    const [type, a, b] = raw.split(":");
    if (type === "newcol") {
      const index = Number(a);
      return { hint: "col:" + index, apply: (id) => relocatePanel(id, { kind: "newColumn", index }) };
    }
    if (type === "col") {
      return { hint: "colz:" + a, apply: (id) => relocatePanel(id, { kind: "column", columnId: a! }) };
    }
    if (type === "panelat") {
      const index = Number(b);
      return { hint: "vg:" + a + ":" + index, apply: (id) => dropPanelAt(id, a!, index) };
    }
    return null;
  };

  const startPanelDrag = (event: React.PointerEvent, panelId: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setFocusedPanelId(panelId);
    setDragPanelId(panelId);
    let drop: { hint: string; apply: (panelId: string) => void } | null = null;
    const onMove = (move: PointerEvent) => {
      drop = resolveDrop(move.clientX, move.clientY);
      setDropHint(drop ? drop.hint : null);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (drop) drop.apply(panelId);
      endDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Cross-session attention: only placed panels with a real open issue or
  // unconfirmed decision, deduped by session and most urgent first.
  const attention = useMemo(
    () => buildWorkbenchAttention(columns.flatMap((col) => col.panels), sessionsById),
    [columns, sessionsById],
  );

  // Focus (maximize) mode: read the maximized panel and drop it if it is gone.
  const maximizedPanel = useMemo(
    () =>
      maximizedId
        ? columns.flatMap((col) => col.panels).find((panel) => panel.id === maximizedId) ?? null
        : null,
    [columns, maximizedId],
  );
  const maximizedMeta = maximizedPanel ? sessionsById.get(maximizedPanel.sessionId) ?? null : null;
  useEffect(() => {
    if (maximizedId && !panelIds.includes(maximizedId)) setMaximizedId(null);
  }, [panelIds, maximizedId]);

  // Placed sessions (deduped, in layout order) for the side-by-side compare view.
  const placedSessions = useMemo(() => {
    const seen = new Set<string>();
    const rows: { panelId: string; meta: SessionMeta }[] = [];
    for (const panel of columns.flatMap((col) => col.panels)) {
      if (seen.has(panel.sessionId)) continue;
      const panelMeta = sessionsById.get(panel.sessionId);
      if (!panelMeta) continue;
      seen.add(panel.sessionId);
      rows.push({ panelId: panel.id, meta: panelMeta });
    }
    return rows;
  }, [columns, sessionsById]);

  // Focus a panel and bring it into view (used by the attention strip and the
  // keyboard shortcuts / command palette).
  const focusPanel = (panelId: string) => {
    setFocusedPanelId(panelId);
    if (typeof document === "undefined") return;
    requestAnimationFrame(() => {
      canvasRef.current
        ?.querySelector(`[data-wb-panel="${panelId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
  };
  const focusRelative = (dir: 1 | -1) => {
    if (panelIds.length === 0) return;
    const current = focusedPanelId ? panelIds.indexOf(focusedPanelId) : -1;
    const next = (current + dir + panelIds.length) % panelIds.length;
    focusPanel(panelIds[next]!);
  };
  const cycleFocusedMode = () => {
    if (!focusedPanelId) return;
    const panel = columns.flatMap((col) => col.panels).find((entry) => entry.id === focusedPanelId);
    if (panel) setPanelMode(focusedPanelId, panel.mode === "conversation" ? "timeline" : "conversation");
  };

  // Keyboard control: ⌘K / Ctrl+K opens the command palette anywhere; the
  // single-key shortcuts act on the focused panel and are suppressed while a
  // field or modal has focus so they never hijack typing.
  const modalOpen =
    Boolean(launcher) ||
    manageOpen ||
    Boolean(nameModal) ||
    paletteOpen ||
    helpOpen ||
    compareOpen ||
    Boolean(maximizedId);
  useEffect(() => {
    if (!hasLayout) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable),
      );
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (!typing && event.key === "?") {
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }
      if (modalOpen || typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key >= "1" && event.key <= "9") {
        const index = Number(event.key) - 1;
        if (index < panelIds.length) {
          event.preventDefault();
          focusPanel(panelIds[index]!);
        }
        return;
      }
      switch (event.key) {
        case "[":
          event.preventDefault();
          focusRelative(-1);
          break;
        case "]":
          event.preventDefault();
          focusRelative(1);
          break;
        case "m":
          event.preventDefault();
          cycleFocusedMode();
          break;
        case "c":
          if (focusedPanelId) {
            event.preventDefault();
            toggleCollapse(focusedPanelId);
          }
          break;
        case "x":
          if (focusedPanelId) {
            event.preventDefault();
            removePanel(focusedPanelId);
          }
          break;
        case "f":
          if (focusedPanelId) {
            event.preventDefault();
            setMaximizedId((id) => (id === focusedPanelId ? null : focusedPanelId));
          }
          break;
        case "/":
          event.preventDefault();
          (document.querySelector("[data-wb-search]") as HTMLInputElement | null)?.focus();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLayout, modalOpen, panelIds, focusedPanelId, columns]);

  // Actions offered by the ⌘K palette. Built fresh each render; the palette
  // only mounts while open, so this stays cheap.
  const paletteActions: CommandAction[] = [
    { id: "add", group: "배치", label: "세션 추가", run: () => setLauncher({ kind: "newColumn", index: columns.length }) },
    { id: "save", group: "배치", label: "배치 저장", run: () => setNameModal({ mode: "save" }) },
    { id: "clear", group: "배치", label: "비우기", run: () => setColumns([]) },
    { id: "layout-single", group: "레이아웃", label: "아래로 쌓기", run: () => applyQuickLayout("single") },
    { id: "layout-columns", group: "레이아웃", label: "옆으로 나란히", run: () => applyQuickLayout("columns") },
    { id: "density", group: "보기", label: density === "dense" ? "편안한 밀도로" : "조밀한 밀도로", run: () => setDensity((value) => (value === "dense" ? "comfortable" : "dense")) },
    { id: "help", group: "보기", label: "단축키 도움말", run: () => setHelpOpen(true) },
    ...(placedSessions.length >= 2
      ? [{ id: "compare", group: "보기", label: "세션 비교", run: () => setCompareOpen(true) }]
      : []),
    ...(focusedPanelId
      ? [{ id: "maximize", group: "보기", label: "현재 패널 최대화", run: () => setMaximizedId(focusedPanelId) }]
      : []),
    ...columns
      .flatMap((col) => col.panels)
      .map((panel) => {
        const panelMeta = sessionsById.get(panel.sessionId);
        return {
          id: `jump-${panel.id}`,
          group: "패널 이동",
          label: panelMeta?.title ?? "세션",
          run: () => focusPanel(panel.id),
        };
      }),
  ];

  return (
    <PageShell
      className="workbench-page"
      maxWidth="full"
      actionBar={
        <ActionBar
          label="워크벤치 컨트롤"
          start={
            hasLayout ? (
              <div className="workbench-toolbar-start">
                <WorkbenchSearch value={search} onChange={setSearch} />
                {presets.length > 0 ? (
                  <PresetBar presets={presets} onApply={applyPreset} onManage={() => setManageOpen(true)} />
                ) : null}
              </div>
            ) : undefined
          }
          end={
            hasLayout ? (
              <>
                <span className="workbench-seg" role="group" aria-label="빠른 배치">
                  <ModeButton icon={Rows2} label="아래로 쌓기" active={false} onClick={() => applyQuickLayout("single")} />
                  <ModeButton icon={Columns2} label="옆으로 나란히" active={false} onClick={() => applyQuickLayout("columns")} />
                </span>
                <span className="workbench-seg-divider" aria-hidden="true" />
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
          description="연동에서 작업 기록을 가져오면 세션을 자유롭게 배치할 수 있습니다."
          actions={
            <Button variant="primary" icon={ArrowUpRight} onClick={() => navigate("connections")}>
              연동 열기
            </Button>
          }
        />
      ) : !hasLayout ? (
        <div className="workbench-blank">
          <div className="workbench-launchpad">
            <header className="workbench-launchpad-head">
              <span className="workbench-blank-icon" aria-hidden="true">
                <LayoutGrid size={22} />
              </span>
              <strong>워크벤치를 구성하세요</strong>
            </header>

            <section className="workbench-launchpad-section">
              <header>
                <span>최근 세션</span>
                <button type="button" onClick={() => setLauncher({ kind: "newColumn", index: 0 })}>
                  모든 세션
                  <ArrowUpRight size={12} aria-hidden="true" />
                </button>
              </header>
              <div className="workbench-launchpad-grid">
                {sessions.slice(0, 6).map((session) => (
                  <button
                    type="button"
                    key={session.sessionId}
                    className="workbench-launchpad-card"
                    onClick={() => addSessionToNewColumn(session.sessionId)}
                  >
                    <strong>{session.title}</strong>
                    <small>
                      {session.sourceLabel ? shortProjectLabel(session.sourceLabel) : "수동 세션"}
                      {session.savedAt ?? session.startedAt
                        ? ` · ${formatRelative(session.savedAt ?? session.startedAt!)}`
                        : ""}
                    </small>
                    <AttentionDots
                      issues={session.openIssues}
                      decisions={session.unconfirmedDecisions}
                      next={session.pendingNextActions}
                    />
                  </button>
                ))}
              </div>
            </section>

            {presets.length > 0 ? (
              <section className="workbench-launchpad-section">
                <header>
                  <span>저장된 배치</span>
                  <button type="button" onClick={() => setManageOpen(true)}>
                    관리
                  </button>
                </header>
                <div className="workbench-launchpad-chips">
                  {presets.map((preset) => (
                    <button key={preset.id} type="button" onClick={() => applyPreset(preset)}>
                      {preset.name}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : (
        <div className={`workbench-surface${density === "dense" ? " is-dense" : ""}`}>
          {attention.length > 0 ? (
            <WorkbenchAttention items={attention} onJump={focusPanel} />
          ) : null}
          <div
            className={`workbench-canvas${dragPanelId ? " is-dragging" : ""}`}
            ref={canvasRef}
          >
            <div
              className={`workbench-col-drop is-lead${hotClass("col:0")}`}
              aria-hidden={!dragPanelId}
              data-drop="newcol:0"
            >
              <Plus size={14} aria-hidden="true" />
            </div>
            {columns.map((col, colIndex) => (
              <Fragment key={col.id}>
                <div
                  className={`workbench-col${dropHint === "colz:" + col.id ? " is-droptarget" : ""}`}
                  style={{ flexGrow: col.flex, flexBasis: 0 }}
                  data-drop={"col:" + col.id}
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
                          search={search}
                          focused={panel.id === focusedPanelId}
                          dragging={panel.id === dragPanelId}
                          onFocus={() => setFocusedPanelId(panel.id)}
                          onGripPointerDown={(event) => startPanelDrag(event, panel.id)}
                          onEdgeAdd={(side) =>
                            setLauncher(edgeTarget(side, col.id, colIndex, panelIndex))
                          }
                          onMode={(panelMode) => setPanelMode(panel.id, panelMode)}
                          onReplace={() => setLauncher({ kind: "replace", panelId: panel.id })}
                          onClose={() => removePanel(panel.id)}
                          onOpen={() => meta && openInWorkspace(meta.sessionId, meta.isActive)}
                          onToggleCollapse={() => toggleCollapse(panel.id)}
                          onMaximize={() => setMaximizedId(panel.id)}
                        />
                        {panelIndex < col.panels.length - 1 ? (
                          <div
                            className={`workbench-vgutter${hotClass("vg:" + col.id + ":" + (panelIndex + 1))}`}
                            role="separator"
                            aria-orientation="horizontal"
                            data-drop={"panelat:" + col.id + ":" + (panelIndex + 1)}
                            onMouseDown={startVResize(col.id, panelIndex)}
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
                    data-drop={"newcol:" + (colIndex + 1)}
                    onMouseDown={startResize(colIndex)}
                  />
                ) : null}
              </Fragment>
            ))}
            {/* Trailing new-column drop target, shown only while dragging a panel. */}
            <div
              className={`workbench-col-drop${hotClass("col:" + columns.length)}`}
              aria-hidden={!dragPanelId}
              data-drop={"newcol:" + columns.length}
            >
              <Plus size={15} aria-hidden="true" />
            </div>
          </div>
          <CommandBar
            meta={focusedMeta}
            value={focusedDraft}
            onChange={setFocusedDraft}
            onCommand={() => setPaletteOpen(true)}
          />
        </div>
      )}

      {paletteOpen ? (
        <CommandPalette
          actions={paletteActions}
          onRun={(action) => {
            setPaletteOpen(false);
            action.run();
          }}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}

      {helpOpen ? <WorkbenchHelp onClose={() => setHelpOpen(false)} /> : null}

      {compareOpen ? (
        <WorkbenchCompare
          rows={placedSessions}
          onJump={(panelId) => {
            setCompareOpen(false);
            focusPanel(panelId);
          }}
          onClose={() => setCompareOpen(false)}
        />
      ) : null}

      {maximizedPanel && maximizedMeta ? (
        <WorkbenchFocus
          panel={maximizedPanel}
          meta={maximizedMeta}
          repository={repository}
          search={search}
          onMode={(panelMode) => setPanelMode(maximizedPanel.id, panelMode)}
          onClose={() => setMaximizedId(null)}
        />
      ) : null}

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
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? sessions.filter((session) =>
            `${session.title} ${session.sourceLabel ?? ""}`.toLowerCase().includes(needle),
          )
        : sessions,
    [sessions, needle],
  );
  const groups = useMemo(() => groupSessions(filtered), [filtered]);
  const flat = useMemo(() => groups.flatMap((group) => group.sessions), [groups]);
  const indexById = useMemo(
    () => new Map(flat.map((session, index) => [session.sessionId, index])),
    [flat],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setActive(0);
  }, [needle]);
  useEffect(() => {
    if (active >= flat.length) setActive(Math.max(0, flat.length - 1));
  }, [flat.length, active]);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onInputKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const session = flat[active];
      if (session) onPick(session.sessionId);
    }
  };

  return (
    <div className="workbench-modal-layer" role="presentation">
      <button type="button" className="workbench-modal-scrim" aria-label="닫기" onClick={onClose} />
      <div className="workbench-modal is-picker" role="dialog" aria-modal="true" aria-label="세션 선택">
        <header className="workbench-modal-head">
          <div className="workbench-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKey}
              aria-label="프로젝트·세션 검색"
              placeholder=""
            />
            <span className="workbench-search-count">{flat.length}</span>
          </div>
          <Button size="sm" variant="ghost" icon={X} title="닫기" onClick={onClose} />
        </header>
        <div className="workbench-picker-list base-scroll">
          {flat.length === 0 ? (
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
                  const index = indexById.get(session.sessionId) ?? -1;
                  const isActive = index === active;
                  const attention =
                    session.openIssues + session.unconfirmedDecisions + session.pendingNextActions;
                  return (
                    <button
                      type="button"
                      key={session.sessionId}
                      ref={isActive ? activeRef : undefined}
                      className={`workbench-picker-row${isActive ? " is-active" : ""}`}
                      onMouseMove={() => setActive(index)}
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
        <footer className="workbench-picker-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> 이동
          </span>
          <span>
            <kbd>Enter</kbd> 추가
          </span>
          <span>
            <kbd>Esc</kbd> 닫기
          </span>
        </footer>
      </div>
    </div>
  );
}

// ─── Keyboard help ────────────────────────────────────────────────────────────

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ["⌘", "K"], desc: "명령 팔레트 열기" },
  { keys: ["/"], desc: "모든 패널 검색" },
  { keys: ["1", "–", "9"], desc: "n번째 패널 포커스" },
  { keys: ["[", "]"], desc: "이전 / 다음 패널" },
  { keys: ["m"], desc: "대화 / 타임라인 전환" },
  { keys: ["c"], desc: "패널 접기 / 펼치기" },
  { keys: ["x"], desc: "패널 닫기" },
  { keys: ["f"], desc: "패널 최대화 / 복귀" },
  { keys: ["?"], desc: "이 도움말 열기 / 닫기" },
];

/** A quiet keyboard cheatsheet so the workbench's power keys are discoverable. */
function WorkbenchHelp({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogFocus<HTMLDivElement>();
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
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="workbench-modal is-help"
        role="dialog"
        aria-modal="true"
        aria-label="단축키 도움말"
      >
        <header className="workbench-modal-head">
          <strong className="workbench-help-title">단축키</strong>
          <Button size="sm" variant="ghost" icon={X} title="닫기" onClick={onClose} />
        </header>
        <div className="workbench-help-list base-scroll">
          {SHORTCUTS.map((shortcut) => (
            <div className="workbench-help-row" key={shortcut.desc}>
              <span className="workbench-help-keys">
                {shortcut.keys.map((key, index) =>
                  key === "–" ? (
                    <span key={index} className="workbench-help-sep">
                      –
                    </span>
                  ) : (
                    <kbd key={index}>{key}</kbd>
                  ),
                )}
              </span>
              <span>{shortcut.desc}</span>
            </div>
          ))}
        </div>
        <footer className="workbench-help-foot">⌘ 대신 Ctrl도 됩니다 · 입력 중에는 단축키가 멈춥니다</footer>
      </div>
    </div>
  );
}

// ─── Overlay focus management ─────────────────────────────────────────────────

/**
 * On open, move keyboard focus into the dialog; on close, return it to whatever
 * was focused before (usually the control that opened it). Keeps the workbench
 * navigable by keyboard without stranding focus behind a dismissed overlay.
 */
function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus?.();
  }, []);
  return ref;
}

// ─── Focus (maximize) overlay ─────────────────────────────────────────────────

/**
 * Maximize one panel over the board for close reading, then drop back to the
 * dense layout. Honors the active search highlight and the panel's view mode;
 * Esc or "f" closes, "m" flips conversation / timeline.
 */
function WorkbenchFocus({
  panel,
  meta,
  repository,
  search,
  onMode,
  onClose,
}: {
  panel: Panel;
  meta: SessionMeta;
  repository: ReturnType<typeof createBrowserDraftRepository>;
  search: string;
  onMode: (mode: PanelMode) => void;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const events = useMemo(
    () => loadConversation(repository, meta.sessionId),
    [repository, meta.sessionId],
  );
  const needle = search.trim().toLowerCase();
  const matched = useMemo(
    () =>
      needle
        ? events.filter((event) =>
            `${event.title} ${event.summary} ${event.actor}`.toLowerCase().includes(needle),
          )
        : events,
    [events, needle],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "f") {
        event.preventDefault();
        onClose();
      } else if (event.key === "m") {
        event.preventDefault();
        onMode(panel.mode === "conversation" ? "timeline" : "conversation");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onMode, panel.mode]);

  const when = meta.savedAt ?? meta.startedAt;

  return (
    <div className="workbench-modal-layer" role="presentation">
      <button type="button" className="workbench-modal-scrim" aria-label="닫기" onClick={onClose} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="workbench-focus"
        role="dialog"
        aria-modal="true"
        aria-label={meta.title}
      >
        <header className="workbench-focus-head">
          <div className="workbench-panel-id">
            <h2>{meta.title}</h2>
            <span>
              {meta.sourceLabel ? shortProjectLabel(meta.sourceLabel) : "수동 세션"}
              {when ? ` · ${formatRelative(when)}` : ""}
            </span>
          </div>
          <span className="workbench-panel-modes" role="group" aria-label="보기 전환">
            <ModeButton icon={MessageSquare} label="대화" active={panel.mode === "conversation"} onClick={() => onMode("conversation")} />
            <ModeButton icon={ListTree} label="타임라인" active={panel.mode === "timeline"} onClick={() => onMode("timeline")} />
          </span>
          <IconAction icon={X} label="최대화 닫기" onClick={onClose} />
        </header>
        <div className="workbench-focus-body base-scroll">
          {panel.mode === "conversation" ? (
            <ConversationFlow events={matched} highlight={needle} />
          ) : (
            <TimelineFlow events={matched} meta={meta} highlight={needle} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Compare (side-by-side) overlay ───────────────────────────────────────────

/**
 * Compare every placed session at a glance: a compact matrix of the honest
 * signals (events, open issues, unconfirmed decisions, pending next actions).
 * No fabricated diff, just the real counts side by side. Click a row to jump to
 * that panel. This is the "review several sessions together" view at the numbers
 * level, complementing the per-panel inspector.
 */
function WorkbenchCompare({
  rows,
  onJump,
  onClose,
}: {
  rows: { panelId: string; meta: SessionMeta }[];
  onJump: (panelId: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>();
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
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="workbench-modal is-compare"
        role="dialog"
        aria-modal="true"
        aria-label="세션 비교"
      >
        <header className="workbench-modal-head">
          <strong className="workbench-help-title">세션 비교</strong>
          <span className="workbench-search-count">{rows.length}</span>
          <Button size="sm" variant="ghost" icon={X} title="닫기" onClick={onClose} />
        </header>
        <div className="workbench-compare-wrap base-scroll">
          <table className="workbench-compare">
            <thead>
              <tr>
                <th scope="col">세션</th>
                <th scope="col">항목</th>
                <th scope="col">이슈</th>
                <th scope="col">결정</th>
                <th scope="col">다음</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ panelId, meta }) => (
                <tr key={panelId} onClick={() => onJump(panelId)} title={`${meta.title} 패널로 이동`}>
                  <th scope="row">
                    <span className="workbench-compare-title">{meta.title}</span>
                    <small>{meta.sourceLabel ? shortProjectLabel(meta.sourceLabel) : "수동 세션"}</small>
                  </th>
                  <td>{meta.eventCount}</td>
                  <td className={meta.openIssues > 0 ? "tone-issue" : ""}>{meta.openIssues}</td>
                  <td className={meta.unconfirmedDecisions > 0 ? "tone-decision" : ""}>
                    {meta.unconfirmedDecisions}
                  </td>
                  <td className={meta.pendingNextActions > 0 ? "tone-next" : ""}>
                    {meta.pendingNextActions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar search + presets ─────────────────────────────────────────────────

/**
 * Unified search across every open panel. Typing filters each panel's events to
 * the matches and dims panels with none, so several sessions can be scanned for
 * the same term at once. Press "/" to focus it, Esc to clear.
 */
function WorkbenchSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="workbench-toolbar-search">
      <Search size={13} aria-hidden="true" />
      <input
        type="text"
        value={value}
        data-wb-search=""
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (value) onChange("");
            else event.currentTarget.blur();
          }
        }}
        aria-label="모든 패널에서 검색"
        placeholder="모든 패널 검색"
      />
      {value ? (
        <button type="button" aria-label="검색 지우기" onClick={() => onChange("")}>
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

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
  search,
  focused,
  dragging,
  onFocus,
  onGripPointerDown,
  onEdgeAdd,
  onMode,
  onReplace,
  onClose,
  onOpen,
  onToggleCollapse,
  onMaximize,
}: {
  panel: Panel;
  meta: SessionMeta | null;
  repository: ReturnType<typeof createBrowserDraftRepository>;
  flex: number;
  search: string;
  focused: boolean;
  dragging: boolean;
  onFocus: () => void;
  onGripPointerDown: (event: React.PointerEvent) => void;
  onEdgeAdd: (side: EdgeSide) => void;
  onMode: (mode: PanelMode) => void;
  onReplace: () => void;
  onClose: () => void;
  onOpen: () => void;
  onToggleCollapse: () => void;
  onMaximize: () => void;
}) {
  const collapsed = panel.collapsed ?? false;
  const [menuOpen, setMenuOpen] = useState(false);
  const events = useMemo(
    () => (meta ? loadConversation(repository, meta.sessionId) : []),
    [repository, meta],
  );
  const needle = search.trim().toLowerCase();
  const matched = useMemo(
    () =>
      needle
        ? events.filter((event) =>
            `${event.title} ${event.summary} ${event.actor}`.toLowerCase().includes(needle),
          )
        : events,
    [events, needle],
  );
  const noMatch = needle.length > 0 && matched.length === 0;

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
      className={`workbench-panel${focused ? " is-focused" : ""}${dragging ? " is-dragging-self" : ""}${collapsed ? " is-collapsed" : ""}${noMatch ? " is-nomatch" : ""}`}
      style={{ flexGrow: collapsed ? 0 : flex, flexBasis: collapsed ? "auto" : 0 }}
      data-wb-panel={panel.id}
      aria-label={meta.title}
      onMouseDown={onFocus}
    >
      <header className="workbench-panel-head">
        <span
          className="workbench-panel-grip"
          role="button"
          aria-label="패널 이동 (끌어서 옮기기)"
          onPointerDown={onGripPointerDown}
        >
          <GripVertical size={14} aria-hidden="true" />
        </span>
        <div
          className="workbench-panel-id"
          onDoubleClick={onMaximize}
          title="더블클릭하면 최대화 (f)"
        >
          <h2>{meta.title}</h2>
          <span>
            {meta.sourceLabel ? shortProjectLabel(meta.sourceLabel) : "수동 세션"}
            {meta.savedAt ?? meta.startedAt ? ` · ${formatRelative(meta.savedAt ?? meta.startedAt!)}` : ""}
          </span>
        </div>
        {needle ? (
          <span className="workbench-panel-match" title={`검색 일치 ${matched.length}건`}>
            {matched.length}
          </span>
        ) : null}
        <div className="workbench-panel-actions">
          {collapsed ? null : (
            <span className="workbench-panel-modes" role="group" aria-label="보기 전환">
              <ModeButton icon={MessageSquare} label="대화" active={panel.mode === "conversation"} onClick={() => onMode("conversation")} />
              <ModeButton icon={ListTree} label="타임라인" active={panel.mode === "timeline"} onClick={() => onMode("timeline")} />
            </span>
          )}
          <IconAction
            icon={collapsed ? ChevronDown : ChevronUp}
            label={collapsed ? "패널 펼치기" : "패널 접기"}
            onClick={onToggleCollapse}
          />
          <span className="workbench-panel-more">
            <IconAction icon={MoreHorizontal} label="더 보기" onClick={() => setMenuOpen((open) => !open)} />
            {menuOpen ? (
              <>
                <button
                  type="button"
                  className="workbench-panel-menu-scrim"
                  aria-label="메뉴 닫기"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="workbench-panel-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onMaximize(); }}>
                    <Maximize2 size={13} aria-hidden="true" />
                    최대화
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onReplace(); }}>
                    <RefreshCcw size={13} aria-hidden="true" />
                    세션 교체
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpen(); }}>
                    <ArrowUpRight size={13} aria-hidden="true" />
                    작업 공간에서 열기
                  </button>
                </div>
              </>
            ) : null}
          </span>
          <IconAction icon={X} label="패널 닫기" onClick={onClose} />
        </div>
      </header>

      {collapsed ? null : (
        <div className="workbench-panel-body base-scroll">
          {panel.mode === "conversation" ? (
            <ConversationFlow events={matched} highlight={needle} />
          ) : (
            <TimelineFlow events={matched} meta={meta} highlight={needle} />
          )}
        </div>
      )}

      {collapsed
        ? null
        : (["top", "right", "bottom", "left"] as const).map((side) => (
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
 * The shared bottom bar. It does not send to an agent (Mori never drives one),
 * so it makes no such promise: it shows which panel is focused, keeps a local
 * scratch note per session (preserved across focus changes, never transmitted),
 * and launches the ⌘K command palette. Honest about being read-only.
 */
function CommandBar({
  meta,
  value,
  onChange,
  onCommand,
}: {
  meta: SessionMeta | null;
  value: string;
  onChange: (value: string) => void;
  onCommand: () => void;
}) {
  return (
    <form className="workbench-command" onSubmit={(event) => event.preventDefault()}>
      <span className="workbench-command-target" title={meta?.title}>
        <Pencil size={12} aria-hidden="true" />
        <span>{meta ? meta.title : "패널을 선택하세요"}</span>
      </span>
      <input
        type="text"
        className="workbench-command-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={!meta}
        aria-label={meta ? `${meta.title} 임시 메모` : "임시 메모"}
        placeholder={meta ? "이 세션 임시 메모 (로컬, 전송하지 않음)" : ""}
      />
      <button type="button" className="workbench-command-cmd" onClick={onCommand} aria-label="명령 팔레트 열기">
        <Command size={12} aria-hidden="true" />
        <kbd>K</kbd>
      </button>
    </form>
  );
}

/**
 * The ⌘K command palette: every workbench action (add / save / clear, layout,
 * density, inspector) plus a jump-to-panel entry per open panel, all reachable
 * from the keyboard. Mirrors the session picker's filter + arrow-key model.
 */
function CommandPalette({
  actions,
  onRun,
  onClose,
}: {
  actions: CommandAction[];
  onRun: (action: CommandAction) => void;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? actions.filter((action) => `${action.label} ${action.group}`.toLowerCase().includes(needle))
        : actions,
    [actions, needle],
  );
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, CommandAction[]>();
    for (const action of filtered) {
      let bucket = map.get(action.group);
      if (!bucket) {
        bucket = [];
        map.set(action.group, bucket);
        order.push(action.group);
      }
      bucket.push(action);
    }
    return order.map((group) => ({ group, actions: map.get(group)! }));
  }, [filtered]);
  const indexById = useMemo(
    () => new Map(filtered.map((action, index) => [action.id, index])),
    [filtered],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setActive(0);
  }, [needle]);
  useEffect(() => {
    if (active >= filtered.length) setActive(Math.max(0, filtered.length - 1));
  }, [filtered.length, active]);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onInputKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const action = filtered[active];
      if (action) onRun(action);
    }
  };

  return (
    <div className="workbench-modal-layer" role="presentation">
      <button type="button" className="workbench-modal-scrim" aria-label="닫기" onClick={onClose} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="workbench-modal is-picker"
        role="dialog"
        aria-modal="true"
        aria-label="명령 팔레트"
      >
        <header className="workbench-modal-head">
          <div className="workbench-search">
            <Command size={14} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKey}
              aria-label="명령 검색"
              placeholder="명령 검색"
            />
            <span className="workbench-search-count">{filtered.length}</span>
          </div>
          <Button size="sm" variant="ghost" icon={X} title="닫기" onClick={onClose} />
        </header>
        <div className="workbench-picker-list base-scroll">
          {filtered.length === 0 ? (
            <div className="workbench-picker-empty">일치하는 명령이 없습니다</div>
          ) : (
            groups.map((group) => (
              <section className="workbench-picker-group" key={group.group}>
                <header>
                  <span>{group.group}</span>
                  <i>{group.actions.length}</i>
                </header>
                {group.actions.map((action) => {
                  const index = indexById.get(action.id) ?? -1;
                  const isActive = index === active;
                  return (
                    <button
                      type="button"
                      key={action.id}
                      ref={isActive ? activeRef : undefined}
                      className={`workbench-picker-row${isActive ? " is-active" : ""}`}
                      onMouseMove={() => setActive(index)}
                      onClick={() => onRun(action)}
                    >
                      <span className="workbench-picker-title">{action.label}</span>
                    </button>
                  );
                })}
              </section>
            ))
          )}
        </div>
        <footer className="workbench-picker-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> 이동
          </span>
          <span>
            <kbd>Enter</kbd> 실행
          </span>
          <span>
            <kbd>Esc</kbd> 닫기
          </span>
        </footer>
      </div>
    </div>
  );
}

/**
 * Cross-session attention strip in the canvas (never a right rail): a compact
 * row of the placed sessions that carry an open issue or unconfirmed decision.
 * Clicking a chip focuses that panel and scrolls it into view. It only renders
 * when something genuinely needs attention, so a clean board shows nothing.
 */
function WorkbenchAttention({
  items,
  onJump,
}: {
  items: WorkbenchAttentionItem[];
  onJump: (panelId: string) => void;
}) {
  return (
    <div className="workbench-attention" role="group" aria-label="검토가 필요한 세션">
      <span className="workbench-attention-label">
        검토 필요
        <i>{items.length}</i>
      </span>
      <div
        className="workbench-attention-items base-scroll"
        onWheel={(event) => {
          const el = event.currentTarget;
          if (el.scrollWidth > el.clientWidth) el.scrollLeft += event.deltaY;
        }}
      >
        {items.map((item) => (
          <button
            key={item.panelId}
            type="button"
            className="workbench-attention-chip"
            title={item.title}
            onClick={() => onJump(item.panelId)}
          >
            <span className="workbench-attention-title">{item.title}</span>
            {item.openIssues > 0 ? (
              <span className="workbench-attention-tag tone-issue">이슈 {item.openIssues}</span>
            ) : null}
            {item.unconfirmedDecisions > 0 ? (
              <span className="workbench-attention-tag tone-decision">결정 {item.unconfirmedDecisions}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConversationFlow({
  events,
  highlight = "",
}: {
  events: ConversationEvent[];
  highlight?: string;
}) {
  if (events.length === 0) {
    return (
      <div className="workbench-flow-empty">
        <MessageSquare size={15} aria-hidden="true" />
        <span>{highlight ? "일치하는 대화가 없습니다" : "대화 기록이 없습니다"}</span>
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
              <strong>
                <Highlight text={event.title} needle={highlight} />
              </strong>
              {event.summary ? (
                <p>
                  <Highlight text={event.summary} needle={highlight} />
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Wrap every case-insensitive occurrence of `needle` in `text` with a mark. */
function Highlight({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let key = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={key++} className="workbench-mark">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

function TimelineFlow({
  events,
  meta,
  highlight = "",
}: {
  events: ConversationEvent[];
  meta: SessionMeta;
  highlight?: string;
}) {
  return (
    <div className="workbench-timeline">
      <StatLine meta={meta} />
      {events.length === 0 ? (
        <div className="workbench-flow-empty">
          <ListTree size={15} aria-hidden="true" />
          <span>{highlight ? "일치하는 이벤트가 없습니다" : "타임라인 이벤트가 없습니다"}</span>
        </div>
      ) : (
        <ol className="workbench-timeline-list">
          {events.map((event) => (
            <li key={event.id}>
              <span
                className={`workbench-timeline-dot${
                  event.kind === "issue" ? " tone-issue" : event.kind === "decision" ? " tone-decision" : ""
                }`}
                aria-hidden="true"
              />
              <div>
                <strong>
                  <Highlight text={event.title} needle={highlight} />
                </strong>
                <small>
                  <Highlight text={event.actor} needle={highlight} />
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
    <button type="button" className={active ? "is-active" : ""} aria-pressed={active} aria-label={label} title={label} onClick={onClick}>
      <Icon size={13} aria-hidden="true" />
    </button>
  );
}

function IconAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" className="workbench-panel-icon" aria-label={label} title={label} onClick={onClick}>
      <Icon size={13} aria-hidden="true" />
    </button>
  );
}

/**
 * The shared count strip used by both the inspector and the panel timeline:
 * a clean four-column row with the issue / decision / next counts coloured by
 * semantic status, so the colour language stays consistent across the surface.
 */
function StatLine({ meta }: { meta: SessionMeta }) {
  return (
    <div className="workbench-statline">
      <div>
        <span>항목</span>
        <strong>{meta.eventCount}</strong>
      </div>
      <div className={meta.openIssues > 0 ? "tone-issue" : ""}>
        <span>이슈</span>
        <strong>{meta.openIssues}</strong>
      </div>
      <div className={meta.unconfirmedDecisions > 0 ? "tone-decision" : ""}>
        <span>결정</span>
        <strong>{meta.unconfirmedDecisions}</strong>
      </div>
      <div className={meta.pendingNextActions > 0 ? "tone-next" : ""}>
        <span>다음</span>
        <strong>{meta.pendingNextActions}</strong>
      </div>
    </div>
  );
}

/** Calm dot-status counts for a session's open issues / decisions / next steps. */
function AttentionDots({ issues, decisions, next }: { issues: number; decisions: number; next: number }) {
  if (issues + decisions + next === 0) return null;
  return (
    <span className="workbench-dots">
      {issues > 0 ? (
        <em className="tone-issue" title={`열린 이슈 ${issues}`}>
          <i aria-hidden="true" />
          {issues}
        </em>
      ) : null}
      {decisions > 0 ? (
        <em className="tone-decision" title={`미확정 결정 ${decisions}`}>
          <i aria-hidden="true" />
          {decisions}
        </em>
      ) : null}
      {next > 0 ? (
        <em className="tone-next" title={`다음 단계 ${next}`}>
          <i aria-hidden="true" />
          {next}
        </em>
      ) : null}
    </span>
  );
}

// ─── Derivations ──────────────────────────────────────────────────────────────

const LAYOUT_KEY = "mori.workbench.layout.v1";
const PRESETS_KEY = "mori.workbench.presets.v1";
const DENSITY_KEY = "mori.workbench.density.v1";

/** Canvas density is a per-device UI preference, persisted like the layout. */
function loadDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  try {
    return window.localStorage.getItem(DENSITY_KEY) === "dense" ? "dense" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function saveDensity(density: Density): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DENSITY_KEY, density);
  } catch {
    // Best-effort.
  }
}

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
        collapsed: p.collapsed === true,
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
    const work = loadSessionWorkItems(repository, row.sessionId);
    return {
      ...row,
      eventCount: stored?.eventCount ?? 0,
      tokenTotal: stored?.tokenTotal ?? 0,
      openIssues: work.openIssues.length,
      unconfirmedDecisions: work.unconfirmedDecisions.length,
      pendingNextActions: work.pendingNextActions.length,
    };
  });
}

type SessionWorkItems = {
  openIssues: string[];
  unconfirmedDecisions: string[];
  pendingNextActions: string[];
};

/**
 * The session's pending work items (titles), read from the same source the
 * rest of the app uses: a saved memory body for real sessions, the demo
 * blueprint for demo sessions. Without the demo branch the workbench would
 * read zeros for the sample data even though Home and the session view show it.
 */
function loadSessionWorkItems(
  repository: ReturnType<typeof createBrowserDraftRepository>,
  sessionId: string,
): SessionWorkItems {
  if (isDemoSessionId(sessionId)) {
    const content = buildDemoSessionContent(sessionId);
    if (!content) return { openIssues: [], unconfirmedDecisions: [], pendingNextActions: [] };
    return {
      openIssues: content.issues.filter((issue) => issue.status === "open").map((issue) => issue.title),
      unconfirmedDecisions: content.decisions.filter((decision) => !decision.confirmed).map((decision) => decision.title),
      pendingNextActions: content.nextActions
        .filter((action) => !isNextActionCompleted(action))
        .map((action) => action.title),
    };
  }
  const body = safeLoadMemoryBody(repository, sessionId);
  return {
    openIssues: (body?.issues ?? []).filter((issue) => issue.status === "open").map((issue) => issue.title),
    unconfirmedDecisions: (body?.decisions ?? []).filter((decision) => !decision.confirmed).map((decision) => decision.title),
    pendingNextActions: (body?.nextActions ?? [])
      .filter((action) => !isNextActionCompleted(action))
      .map((action) => action.title),
  };
}

const DEMO_ACTOR_LABEL: Record<string, string> = {
  aiConversation: "AI",
  decision: "결정",
  issue: "이슈",
  fileCode: "코드",
  artifact: "산출물",
  documentNote: "노트",
  webResearch: "리서치",
};

function loadConversation(
  repository: ReturnType<typeof createBrowserDraftRepository>,
  sessionId: string,
): ConversationEvent[] {
  // Demo sessions carry their timeline as blueprint beats, not imported records,
  // so read them from the same builder Home and the session view use. Without
  // this the workbench panels (and the unified search over them) stay empty for
  // the sample data even though the rest of the app shows it.
  if (isDemoSessionId(sessionId)) {
    const content = buildDemoSessionContent(sessionId);
    if (!content) return [];
    return content.events
      .slice()
      .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))
      .slice(0, 80)
      .map((event) => ({
        id: event.id,
        actor: event.actor ?? DEMO_ACTOR_LABEL[event.type] ?? "기록",
        kind: event.type,
        title: event.title,
        summary: event.summary,
        at: event.start,
      }));
  }
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
        kind: event.type,
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

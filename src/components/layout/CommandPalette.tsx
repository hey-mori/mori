import {
  CornerDownLeft,
  FileText,
  FolderGit2,
  Layers,
  Palette,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  useSessionStore,
} from "../../app/sessionStore";
import { useThemeStore } from "../../app/themeStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import {
  buildCommands,
  capBrowseCommands,
  filterCommands,
  groupCommands,
  type CommandEntry,
  type CommandTarget,
} from "../../lib/commandPalette/commandPalette";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import type { KernelContext, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { savedPassageTexts } from "../../lib/capture/passageSearch";
import { useSessionResolver } from "../../features/session/useSessionResolver";
import {
  PASSAGE_SCAN_CAP,
  passageOnlyRecordIds,
  recordTextHolds,
  recordToEntry,
  viaSavedPassage,
  withoutDuplicateSessions,
} from "./paletteRecords";
import {
  displayTime,
  schemaLabel,
} from "../../features/record-ledger/recordPresentation";
import { formatDate } from "../../lib/formatting/time";

/**
 * Command palette — the keyboard-first front door to every navigation,
 * session, and quick-action surface.
 *
 * Opens on Cmd+K / Ctrl+K. Closes on ESC, scrim click, or after a command
 * runs. The list is derived once per open and re-filtered as the user
 * types; arrow keys move the highlight; Enter runs the highlighted entry.
 *
 * Producer-neutral: commands come from `buildCommands` (pure module). The
 * palette never special-cases a command's intent — every entry carries a
 * `CommandTarget` the palette translates into a store call here, so a
 * future producer that adds new entries doesn't need to touch this file.
 */
export function CommandPalette({
  onToggleSidebarCollapsed,
}: {
  onToggleSidebarCollapsed?: () => void;
}) {
  const open = useAppStore((state) => state.commandPaletteOpen);
  const close = useAppStore((state) => state.closeCommandPalette);
  const currentView = useAppStore((state) => state.currentView);
  const navigate = useAppStore((state) => state.navigate);
  const openSession = useAppStore((state) => state.openSession);
  const openRecordInLedger = useAppStore((state) => state.openRecordInLedger);
  const resolveSession = useSessionResolver();
  const requestNewRecord = useAppStore((state) => state.requestNewRecord);
  const openSettingsSheet = useAppStore((state) => state.openSettingsSheet);
  const openLanguageTool = useAppStore((state) => state.openLanguageTool);
  const loadBrowserSession = useSessionStore(
    (state) => state.loadBrowserSession,
  );
  const activeSessionId = useSessionStore(
    (state) => state.draft?.session.id ?? null,
  );
  const currentTheme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Kernel-record search (S1): the palette additionally queries the ledger's
  // FTS engine so captured records are findable, not just sessions + commands.
  // Records arrive async and query-relevant, so they bypass `filterCommands`
  // (which would drop a body-text match whose title lacks the query).
  const [recordEntries, setRecordEntries] = useState<CommandEntry[]>([]);
  const [recordNote, setRecordNote] = useState<string | null>(null);
  const [recordError, setRecordError] = useState(false);
  const contextsRef = useRef<KernelContext[]>([]);
  // Saved passage texts by record, read once per open: a record whose body
  // was rewritten is still found by the passage it was saved from. Held as
  // the read itself, so a query typed before it lands still waits for it.
  const passagesRef = useRef<Promise<ReadonlyMap<string, readonly string[]>>>(Promise.resolve(new Map()));
  const registry = useMemo(() => createSchemaRegistry(), []);

  // Reset the input + cursor whenever the palette opens so a fresh trigger
  // never inherits the previous run's typed query.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    // Defer focus to the next tick — the input is just being mounted.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Load the context id → name map once per open so a record row can name its
  // project without a per-keystroke query. Best-effort: a failure just drops
  // the context name from the meta line.
  useEffect(() => {
    if (!open) {
      setRecordEntries([]);
      setRecordNote(null);
      setRecordError(false);
      return;
    }
    let cancelled = false;
    getKernelRepository()
      .listContexts()
      .then((result) => {
        if (cancelled) return;
        contextsRef.current = result.data;
      })
      .catch(() => {});
    const repo = getKernelRepository();
    passagesRef.current = Promise.all([repo.listSources(), repo.listSourceLinks()])
      .then(([sources, links]) => savedPassageTexts(sources.data, links.data))
      .catch(() => new Map());
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Debounced FTS over the ledger. Fires at 2+ characters, drops stale
  // in-flight results by query token, and caps at 8 rows per the spec.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setRecordEntries([]);
      setRecordNote(null);
      setRecordError(false);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      getKernelRepository()
        .searchRecords(text, 8)
        .then(async (result) => {
          if (cancelled) return;
          const live = (record: MoriRecord | null): record is MoriRecord =>
            Boolean(record) && record!.status !== "discarded" && record!.status !== "archived";
          const found = result.data.filter(live);
          const passages = await passagesRef.current;
          if (cancelled) return;
          // Liveness is known only after the read, so collect past the room
          // left and cut after dropping discarded or archived records.
          const extraIds = passageOnlyRecordIds(
            passages,
            text,
            new Set(result.data.map((record) => record.id)),
            PASSAGE_SCAN_CAP,
          );
          const extra = (
            await Promise.all(extraIds.map((id) => getKernelRepository().getRecord(id).then((r) => r.data)))
          )
            .filter(live)
            .slice(0, Math.max(0, 8 - found.length));
          if (cancelled) return;
          const entries = [
            ...found.map((record) => recordToEntry(record, registry, contextsRef.current)),
            // Text search matches whole words; a body holding the query inside
            // a longer word was missed by it but is still the record's own text.
            ...extra.map((record) => {
              const entry = recordToEntry(record, registry, contextsRef.current);
              return recordTextHolds(record, text) ? entry : viaSavedPassage(entry);
            }),
          ];
          setRecordEntries(entries);
          setRecordError(false);
          setRecordNote(recordSearchNote(result.source, result.fellBack));
        })
        .catch(() => {
          if (cancelled) return;
          setRecordEntries([]);
          setRecordNote(null);
          setRecordError(true);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, registry]);

  // Sessions are re-read every time the palette opens — the live sidebar
  // already tracks them, but reading fresh here means a new import is
  // findable without a parent rerender.
  const sessions = useMemo(() => (open ? safeListSessions() : []), [open]);

  const commands = useMemo(
    () => buildCommands({ sessions, currentView, currentTheme }),
    [sessions, currentView, currentTheme],
  );
  // A typed query searches the whole command set (every session included); an
  // empty query shows a short browse menu so opening the palette stays calm.
  const filtered = useMemo(
    () => (query.trim() ? filterCommands(commands, query) : capBrowseCommands(commands)),
    [commands, query],
  );
  // Record entries are already query-relevant from the FTS pass, so they join
  // the sections directly (groupCommands only buckets + orders, never filters).
  const sections = useMemo(
    () => groupCommands([...withoutDuplicateSessions(filtered, recordEntries), ...recordEntries]),
    [filtered, recordEntries],
  );
  // Flatten in display order so arrow-key navigation walks the same list
  // the user sees on screen.
  const flatVisible = useMemo(
    () => sections.flatMap((section) => section.entries),
    [sections],
  );

  const runCommand = useCallback(
    (entry: CommandEntry) => {
      const target: CommandTarget = entry.target;
      switch (target.kind) {
        case "navigate":
          navigate(target.view);
          break;
        case "newRecord":
          requestNewRecord();
          break;
        case "openRecord":
          openRecordInLedger(target.recordId);
          break;
        case "openAgentSession": {
          const sessionId = target.sessionId;
          void resolveSession(sessionId).then((outcome) => {
            if (outcome === "opened") openSession("flow");
            else if (outcome === "unavailable") openRecordInLedger(sessionId);
          });
          break;
        }
        case "openSession":
          if (target.sessionId !== activeSessionId) {
            loadBrowserSession(target.sessionId);
          }
          openSession(target.tab ?? "flow");
          break;
        case "openSettings":
          openSettingsSheet(target.segment ?? "localAi");
          break;
        case "toggleSidebarCollapsed":
          onToggleSidebarCollapsed?.();
          break;
        case "openLanguageTool":
          openLanguageTool();
          break;
        case "setTheme":
          setTheme(target.theme);
          break;
      }
      close();
    },
    [
      activeSessionId,
      close,
      loadBrowserSession,
      navigate,
      onToggleSidebarCollapsed,
      openRecordInLedger,
      resolveSession,
      requestNewRecord,
      openSession,
      openSettingsSheet,
      openLanguageTool,
      setTheme,
    ],
  );

  // Keep the highlight inside the visible range when the filter shrinks.
  useEffect(() => {
    if (highlight >= flatVisible.length) setHighlight(0);
  }, [flatVisible.length, highlight]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((prev) =>
          flatVisible.length === 0 ? 0 : (prev + 1) % flatVisible.length,
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((prev) =>
          flatVisible.length === 0
            ? 0
            : (prev - 1 + flatVisible.length) % flatVisible.length,
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const entry = flatVisible[highlight];
        if (entry) runCommand(entry);
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, flatVisible, highlight, close, runCommand]);

  // Scroll the highlighted row into view as the user moves through it.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>(
      `[data-cmd-index="${highlight}"]`,
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  if (!open) return null;

  return (
    <div className="command-palette-layer" role="presentation">
      <div
        className="command-palette-scrim"
        onClick={close}
        aria-hidden="true"
      />
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="명령 팔레트"
      >
        <header className="command-palette-input">
          <Search size={14} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            placeholder=""
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="명령 검색"
          />
          <kbd className="command-palette-hint">ESC</kbd>
        </header>
        <div className="command-palette-list base-scroll" ref={listRef}>
          {sections.map((section) => (
            <section key={section.group}>
              <p className="command-palette-section">{section.label}</p>
              <ul>
                {section.entries.map((entry) => {
                  const index = flatVisible.indexOf(entry);
                  const isActive = index === highlight;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        data-cmd-index={index}
                        className={`command-palette-row${isActive ? " is-active" : ""}`}
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => runCommand(entry)}
                      >
                        <CommandIcon entry={entry} />
                        <span className="command-palette-row-label">
                          {entry.label}
                        </span>
                        {entry.hint ? (
                          <span className="command-palette-row-hint">
                            {entry.hint}
                          </span>
                        ) : null}
                        {isActive ? (
                          <CornerDownLeft
                            size={12}
                            aria-hidden="true"
                            className="command-palette-row-enter"
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {section.group === "record" && recordNote ? (
                <p className="command-palette-caption">{recordNote}</p>
              ) : null}
            </section>
          ))}
          {recordError ? (
            <section>
              <p className="command-palette-section">기록</p>
              <p className="command-palette-caption">
                검색을 사용할 수 없습니다.
              </p>
            </section>
          ) : null}
          {sections.length === 0 && !recordError ? (
            <p className="command-palette-empty">일치하는 명령이 없습니다.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CommandIcon({ entry }: { entry: CommandEntry }) {
  switch (entry.group) {
    case "navigate":
      return <Layers size={13} aria-hidden="true" />;
    case "record":
      return <FileText size={13} aria-hidden="true" />;
    case "session":
      return <FolderGit2 size={13} aria-hidden="true" />;
    case "action":
      return <Sparkles size={13} aria-hidden="true" />;
    case "theme":
      return <Palette size={13} aria-hidden="true" />;
    case "settings":
      return <Settings size={13} aria-hidden="true" />;
  }
}

/** Honest footer for the 기록 section: name the weaker search path so browser
 *  substring or a desktop localStorage fallback is never faked as full FTS. */
function recordSearchNote(
  source: "browser-local-storage" | "desktop-sqlite",
  fellBack: boolean,
): string | null {
  if (source === "browser-local-storage") {
    return "간단 검색 · 데스크톱에서 전체 검색";
  }
  if (fellBack) {
    return "간단 검색 · 로컬 저장소";
  }
  return null;
}

function safeListSessions() {
  try {
    // Match the sidebar's "real first, demos as fallback" rule so the
    // palette and the visible list never disagree about what's there.
    return mergeDemoSessionSummaries(loadStoredSessionSummaries());
  } catch {
    return [];
  }
}

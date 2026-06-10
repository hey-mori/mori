import {
  CornerDownLeft,
  FolderGit2,
  Layers,
  Palette,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../../styles/features/command-palette.css";
import { useAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  useSessionStore,
} from "../../app/sessionStore";
import { useThemeStore } from "../../app/themeStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import {
  buildCommands,
  filterCommands,
  groupCommands,
  type CommandEntry,
  type CommandTarget,
} from "../../lib/commandPalette/commandPalette";

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
  const openSettingsSheet = useAppStore((state) => state.openSettingsSheet);
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

  // Reset the input + cursor whenever the palette opens so a fresh trigger
  // never inherits the previous run's typed query.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    // Defer focus to the next tick — the input is just being mounted.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Sessions are re-read every time the palette opens — the live sidebar
  // already tracks them, but reading fresh here means a new import is
  // findable without a parent rerender.
  const sessions = useMemo(() => (open ? safeListSessions() : []), [open]);

  const commands = useMemo(
    () => buildCommands({ sessions, currentView, currentTheme }),
    [sessions, currentView, currentTheme],
  );
  const filtered = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );
  const sections = useMemo(() => groupCommands(filtered), [filtered]);
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
      openSession,
      openSettingsSheet,
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
          {sections.length === 0 ? (
            <p className="command-palette-empty">일치하는 명령이 없습니다.</p>
          ) : (
            sections.map((section) => (
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
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CommandIcon({ entry }: { entry: CommandEntry }) {
  switch (entry.group) {
    case "navigate":
      return <Layers size={13} aria-hidden="true" />;
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

function safeListSessions() {
  try {
    // Match the sidebar's "real first, demos as fallback" rule so the
    // palette and the visible list never disagree about what's there.
    return mergeDemoSessionSummaries(loadStoredSessionSummaries());
  } catch {
    return [];
  }
}

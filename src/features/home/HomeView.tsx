import { Search } from "lucide-react";
import { useAppStore } from "../../app/store";

/**
 * Platform-aware shortcut hint for the command input. The actual Cmd+K /
 * Ctrl+K listener lives in AppShell; this is only the label shown in the pill.
 */
const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");
const SHORTCUT_LABEL = IS_MAC ? "⌘ K" : "Ctrl K";

/**
 * Home: the Command Home.
 *
 * A single, calm command entry: an ambient lavender wash, the question
 * "무엇을 이어갈까요?", and one command input that opens the ⌘K palette. Nothing
 * else, on purpose. The palette already covers search plus every navigation,
 * session, import, and theme command, and the sidebar lists the work, so Home
 * stays a quiet place to *start* rather than a board of redundant buttons.
 * Mori's richer "pick up where you left off" surface is one keystroke away via
 * the palette ("이어가기 열기" → HomeContinuationView).
 */
export function HomeView() {
  const openCommandPalette = useAppStore((state) => state.openCommandPalette);

  return (
    <div className="home-canvas">
      <div className="home-ambient" aria-hidden="true">
        <span className="home-ambient-blob home-ambient-blob-a" />
        <span className="home-ambient-blob home-ambient-blob-b" />
        <span className="home-ambient-sheen" />
      </div>

      <div className="home-canvas-scroll base-scroll">
        <section className="home-command-center">
          <h1 className="home-headline">무엇을 이어갈까요?</h1>

          <button
            type="button"
            className="home-command-input"
            onClick={openCommandPalette}
            aria-keyshortcuts="Meta+K Control+K"
            aria-label="검색 또는 명령 실행"
          >
            <Search className="home-command-input-icon" size={18} aria-hidden="true" />
            <span className="home-command-input-text">프로젝트, 세션, 메모리 검색…</span>
            <kbd className="home-command-input-kbd">{SHORTCUT_LABEL}</kbd>
          </button>
        </section>
      </div>
    </div>
  );
}

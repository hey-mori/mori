import { MoriCommandSpaceHome } from "./MoriCommandSpaceHome";

/**
 * Home experiment slot.
 *
 * The landing is `MoriCommandSpaceHome`: an interactive command field that makes
 * Mori feel like a place to summon, reshape, and route work context. Keep this
 * wrapper intentionally tiny so future home concepts can be swapped without
 * disturbing App routing. The work-memory overview cards (기억 상태 · 작업 흐름 ·
 * 지금 이어갈 것) live on the 대시보드, not here — Home stays the command canvas.
 */
export function HomeView() {
  return <MoriCommandSpaceHome />;
}

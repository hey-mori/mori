import { MoriCommandSpaceHome } from "./MoriCommandSpaceHome";

/**
 * Home experiment slot.
 *
 * The current landing is `MoriCommandSpaceHome`: an interactive command field
 * that makes Mori feel like a place to summon, reshape, and route work
 * context. Keep this wrapper intentionally tiny so future home concepts can be
 * swapped without disturbing App routing or the retired continuation surface.
 */
export function HomeView() {
  return <MoriCommandSpaceHome />;
}

/**
 * The always-visible watching state, and the one tap that turns it off.
 *
 * This is not decoration. Rail B of the surveillance line
 * (`docs/mori-project-goal.md` §6) permits Mori to keep reading explicitly
 * connected agent logs while it runs only when three things hold, and the third
 * is transparency: an explicit opt-in, a state the user can always see, and a
 * one-tap off. "It never hides in the tray" is the doc's phrasing. Ambient
 * observation is not allowed to ship without this control, which is why it lives
 * in the sidebar rather than behind a settings page: the sidebar is the only
 * surface present on every screen.
 *
 * It renders nothing when the opt-in is off, so a user who never turned it on
 * carries no chrome for a feature they do not use.
 */
import { Radio } from "lucide-react";
import { useObservationStore } from "../../app/observationStore";
import { useObservedSessions } from "../../features/live-session/useAmbientObservation";

export function ObservationIndicator() {
  const ambient = useObservationStore((state) => state.ambient);
  const setAmbient = useObservationStore((state) => state.setAmbient);
  const { snapshot, reason } = useObservedSessions();

  if (!ambient) return null;

  const active = reason === "ambient" && snapshot.status === "watching";
  const count = snapshot.activeCount;

  return (
    <button
      type="button"
      className={`sidebar-observing${active ? " is-on" : ""}`}
      onClick={() => setAmbient(false)}
      // The label states what is happening AND what the tap does, because a
      // control whose effect is unclear is not a one-tap off.
      aria-label={
        active
          ? `연결된 세션 ${count}개를 보고 있습니다. 눌러서 끄기`
          : "관측이 켜져 있습니다. 눌러서 끄기"
      }
      title={active ? `세션 ${count}개 관측 중 · 눌러서 끄기` : "관측 켜짐 · 눌러서 끄기"}
    >
      <Radio size={14} aria-hidden="true" />
      <span className="sidebar-observing-label">{active ? `보는 중 ${count}` : "보는 중"}</span>
    </button>
  );
}

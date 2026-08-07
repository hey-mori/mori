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
  const { snapshot, reason, available } = useObservedSessions();

  if (!ambient) return null;

  // Three states, not two. "Turned on" and "actually watching" are different
  // claims, and where there is no agent bridge to read (the browser build) the
  // honest answer is that this environment cannot observe at all. Saying
  // "보는 중" there would be the fake connected state the product bans
  // (`docs/mori-project-goal.md` §10).
  const state: "unavailable" | "watching" | "idle" = !available
    ? "unavailable"
    : reason === "ambient" && snapshot.status === "watching"
      ? "watching"
      : "idle";
  const count = snapshot.activeCount;

  const copy = {
    unavailable: {
      label: "데스크톱 전용",
      title: "이 환경에서는 세션을 읽을 수 없습니다 · 눌러서 끄기",
      aria: "이 환경에서는 세션을 읽을 수 없어 관측이 동작하지 않습니다. 눌러서 끄기",
    },
    watching: {
      label: `보는 중 ${count}`,
      title: `세션 ${count}개 관측 중 · 눌러서 끄기`,
      aria: `연결된 세션 ${count}개를 보고 있습니다. 눌러서 끄기`,
    },
    idle: {
      label: "관측 대기",
      title: "관측이 켜져 있고, 아직 읽는 세션은 없습니다 · 눌러서 끄기",
      aria: "관측이 켜져 있고 아직 읽는 세션은 없습니다. 눌러서 끄기",
    },
  }[state];

  return (
    <button
      type="button"
      className={`sidebar-observing is-${state}`}
      onClick={() => setAmbient(false)}
      // The label states what is happening AND what the tap does, because a
      // control whose effect is unclear is not a one-tap off.
      aria-label={copy.aria}
      title={copy.title}
    >
      <Radio size={14} aria-hidden="true" />
      <span className="sidebar-observing-label">{copy.label}</span>
    </button>
  );
}

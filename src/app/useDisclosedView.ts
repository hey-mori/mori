import { useMemo } from "react";
import type { TimelineEvent } from "../domain/types";
import { discloseEventForView, resolveDisclosureLevel } from "../lib/disclosure";
import { useSessionStore } from "./sessionStore";

/**
 * A session view whose events read as the request disclosure level shows
 * them (the default level, then any per-request override). Every derived
 * surface reads this, so a request hidden at 숨김 cannot leak through one of
 * them. Display only: writes look the stored event up by id.
 */
export function useDisclosedView<V extends { events: TimelineEvent[] }>(view: V): V {
  const disclosureDefault = useSessionStore((state) => state.analysisSettings.requestDisclosureLevel);
  const disclosureOverrides = useSessionStore((state) => state.requestDisclosureOverrides);
  return useMemo(() => {
    const events = view.events.map((event) =>
      discloseEventForView(event, resolveDisclosureLevel(disclosureOverrides[event.id], disclosureDefault)),
    );
    return events.some((event, index) => event !== view.events[index]) ? { ...view, events } : view;
  }, [view, disclosureDefault, disclosureOverrides]);
}

/** The same rule as a function over single events, for loaders that read
 *  stored events themselves. Changes identity when the level changes, so a
 *  memo that depends on it recomputes. */
export function useDiscloseEvent(): <E extends TimelineEvent>(event: E) => E {
  const disclosureDefault = useSessionStore((state) => state.analysisSettings.requestDisclosureLevel);
  const disclosureOverrides = useSessionStore((state) => state.requestDisclosureOverrides);
  return useMemo(
    () =>
      <E extends TimelineEvent>(event: E): E =>
        discloseEventForView(event, resolveDisclosureLevel(disclosureOverrides[event.id], disclosureDefault)),
    [disclosureDefault, disclosureOverrides],
  );
}

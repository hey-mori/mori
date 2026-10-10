import { useMemo } from "react";
import type { TimelineEvent } from "../domain/types";
import { discloseEventForView, recordTitleForView, resolveDisclosureLevel, sessionTitleForView } from "../lib/disclosure";
import { useSessionStore } from "./sessionStore";

/**
 * A session view whose events read as the request disclosure level shows
 * them (the default level, then any per-request override). Every derived
 * surface reads this, so a request hidden at 숨김 cannot leak through one of
 * them. Display only: writes look the stored event up by id.
 */
export function useDisclosedView<
  V extends { events: TimelineEvent[]; session?: { title: string; titleFromRequest?: boolean } },
>(view: V): V {
  const disclosureDefault = useSessionStore((state) => state.analysisSettings.requestDisclosureLevel);
  const disclosureOverrides = useSessionStore((state) => state.requestDisclosureOverrides);
  return useMemo(() => {
    const events = view.events.map((event) =>
      discloseEventForView(event, resolveDisclosureLevel(disclosureOverrides[event.id], disclosureDefault)),
    );
    const session = view.session;
    const sessionTitle = session ? sessionTitleForView(session.title, session.titleFromRequest, disclosureDefault) : undefined;
    const eventsChanged = events.some((event, index) => event !== view.events[index]);
    const titleChanged = Boolean(session && sessionTitle !== session.title);
    if (!eventsChanged && !titleChanged) return view;
    return {
      ...view,
      events: eventsChanged ? events : view.events,
      ...(titleChanged && session ? { session: { ...session, title: sessionTitle! } } : {}),
    };
  }, [view, disclosureDefault, disclosureOverrides]);
}

/** The open session's title as the request disclosure level shows it. */
export function useShownSessionTitle(session: { title: string; titleFromRequest?: boolean } | null | undefined): string {
  const level = useSessionStore((state) => state.analysisSettings.requestDisclosureLevel);
  return session ? sessionTitleForView(session.title, session.titleFromRequest, level) : "";
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

/** Session titles as the request disclosure level shows them: a title known to
 *  be the user's first request follows the default level (a session has no
 *  per-request override). Pass a summary's or session's title and flag. */
export function useSessionTitle(): (title: string, fromRequest: boolean | undefined) => string {
  const level = useSessionStore((state) => state.analysisSettings.requestDisclosureLevel);
  return useMemo(() => (title: string, fromRequest: boolean | undefined) => sessionTitleForView(title, fromRequest, level), [level]);
}

/** The same for a session record (its `titleFromRequest` property). */
export function useRecordTitle(): (record: { title: string; properties?: Record<string, unknown> }) => string {
  const level = useSessionStore((state) => state.analysisSettings.requestDisclosureLevel);
  return useMemo(() => (record: { title: string; properties?: Record<string, unknown> }) => recordTitleForView(record, level), [level]);
}

import type { EventActor } from "../../domain/types";
import { buildRequestAbstraction } from "./requestAbstraction";
import {
  projectDisclosure,
  type DisclosureLevel,
  type DisclosureProjection,
} from "./disclosureLevel";

/** True when an event is the user's own request message (privacy-sensitive). */
export function isUserRequestEvent(event: { actor?: EventActor }): boolean {
  return event.actor === "user";
}

/**
 * Project an event's summary for display at a disclosure level. Only the
 * user's own request events are subject to disclosure; every other actor's
 * event renders its summary unchanged. Centralizing this here means every
 * surface (Event Inspector, chronological list, and any future view) hides
 * request text identically, so a withheld request cannot leak through an
 * alternate render path.
 */
export function projectEventRequestSummary(
  event: { actor?: EventActor; summary: string },
  level: DisclosureLevel,
): DisclosureProjection {
  if (!isUserRequestEvent(event)) {
    return { level: "raw", text: event.summary, isWithheld: false, fallbackUsed: false };
  }
  const abstraction = buildRequestAbstraction(event.summary);
  return projectDisclosure(
    { raw: event.summary, summary: abstraction.summary, abstract: abstraction.abstract },
    level,
  );
}

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
  /**
   * Optional precomputed abstraction (for example a local-LLM result).
   * A non-empty `summary` / `abstract` here overrides the deterministic
   * one for that variant; missing fields fall back to the deterministic
   * floor, so an override can only improve, never erase, the projection.
   */
  override?: { summary?: string; abstract?: string },
): DisclosureProjection {
  if (!isUserRequestEvent(event)) {
    return { level: "raw", text: event.summary, isWithheld: false, fallbackUsed: false };
  }
  const abstraction = buildRequestAbstraction(event.summary);
  return projectDisclosure(
    {
      raw: event.summary,
      summary: override?.summary?.trim() || abstraction.summary,
      abstract: override?.abstract?.trim() || abstraction.abstract,
    },
    level,
  );
}

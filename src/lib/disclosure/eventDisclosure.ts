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

/** What a hidden request reads as wherever its title would show. */
export const HIDDEN_REQUEST_TITLE = "숨긴 요청";

/**
 * Whether an event's title is the user's own words: a turn the user opened
 * (its title is the prompt, `openedByUser`), a lone request message, or a
 * pasted or exported transcript turn that keeps the ask as `requestText`
 * (its title is the ask). An agent reply, a tool run or a notice has a title
 * of its own.
 */
export function isRequestTitledEvent(event: {
  actor?: EventActor;
  openedByUser?: boolean;
  requestText?: string;
}): boolean {
  return event.openedByUser === true || event.actor === "user" || Boolean(event.requestText?.trim());
}

/**
 * The event as a derived view shows it at a disclosure level. Only 숨김
 * changes anything here: a request-titled event reads "숨긴 요청", and a
 * lone request's own text (its summary) is left out. 요약 and 요지 keep the
 * title for navigation; their body projection is `projectEventRequestSummary`.
 * The retained `requestText` stays: the inspector gates it itself and offers
 * the per-request reveal. Display only: never pass the result to a write.
 */
export function discloseEventForView<
  T extends {
    actor?: EventActor;
    openedByUser?: boolean;
    requestText?: string;
    responseText?: string;
    title: string;
    summary: string;
  },
>(event: T, level: DisclosureLevel): T {
  if (level !== "hidden" || !isRequestTitledEvent(event)) return event;
  // An unanswered pasted ask keeps the ask as its summary too.
  const unanswered = Boolean(event.requestText?.trim()) && !event.responseText?.trim();
  return {
    ...event,
    title: HIDDEN_REQUEST_TITLE,
    summary: isUserRequestEvent(event) || unanswered ? "" : event.summary,
  };
}

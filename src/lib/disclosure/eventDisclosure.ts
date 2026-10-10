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

/** The longest title the 요약 level gives a request (its first sentence, cut
 *  here): shorter than the raw title, so it never shows more than the level. */
const SUMMARY_TITLE_CHARS = 60;

/** A request's text as one disclosure level shows it, from the validated
 *  variants (`buildRequestAbstraction`): 요약 its first sentence, 요지 the
 *  content-free intent line. */
function requestTextAtLevel(text: string, level: "summary" | "abstract", maxSummaryChars?: number): string {
  const abstraction = buildRequestAbstraction(text, maxSummaryChars ? { maxSummaryChars } : {});
  return projectDisclosure({ raw: text, summary: abstraction.summary, abstract: abstraction.abstract }, level).text;
}

/**
 * The event as a derived view shows it at a disclosure level. A
 * request-titled event's title follows the level: 요약 its first sentence
 * (shorter than the raw title), 요지 the intent line ("사용자가 수정·디버깅을
 * 요청함"), 숨김 "숨긴 요청". A lone request's own text (its summary) follows
 * the same way, and is left out at 숨김. Agent replies stay as they are. The
 * retained `requestText` stays: the inspector gates it itself and offers the
 * per-request reveal. Display only: never pass the result to a write.
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
  if (level === "raw" || !isRequestTitledEvent(event)) return event;
  // An unanswered pasted ask keeps the ask as its summary too.
  const summaryIsTheAsk =
    isUserRequestEvent(event) || (Boolean(event.requestText?.trim()) && !event.responseText?.trim());
  if (level === "hidden") {
    return { ...event, title: HIDDEN_REQUEST_TITLE, summary: summaryIsTheAsk ? "" : event.summary };
  }
  const ask = event.requestText?.trim() || event.title;
  return {
    ...event,
    title: requestTextAtLevel(ask, level, SUMMARY_TITLE_CHARS) || event.title,
    summary: summaryIsTheAsk ? requestTextAtLevel(event.summary, level) : event.summary,
  };
}

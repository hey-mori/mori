import type { EventActor } from "../../domain/types";
import { buildRequestAbstraction } from "./requestAbstraction";
import { boilerplateLabel, isAgentBoilerplateTitle } from "../import/sanitizeTitle";
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
  // An agent notice imported as a user turn is not a request; below 원문 its
  // text (which can carry the user's command arguments) is not shown.
  if (level !== "raw" && isAgentBoilerplateTitle(event.summary)) {
    return { level, text: "", isWithheld: true, fallbackUsed: false };
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
export function requestTextAtLevel(text: string, level: "summary" | "abstract", maxSummaryChars?: number): string {
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
  // An agent notice imported as a user turn (a slash-command caveat, an
  // interruption, a task notification) is not a request to project: below
  // 숨김 it reads as its label, and its text (which can carry the user's own
  // command arguments) is left out.
  const notice =
    isAgentBoilerplateTitle(event.title) || (event.title === "세션 이어가기" && isAgentBoilerplateTitle(event.summary));
  if (level !== "hidden" && notice) {
    // Its fixed label ("요청 중단", "작업 알림", ...), never the command's name.
    const label = boilerplateLabel(isAgentBoilerplateTitle(event.title) ? event.title : event.summary, { commandName: false });
    return { ...event, title: label || "세션 이어가기", summary: "" };
  }
  // An unanswered pasted ask keeps the ask as its summary too.
  const summaryIsTheAsk =
    isUserRequestEvent(event) || (Boolean(event.requestText?.trim()) && !event.responseText?.trim());
  if (level === "hidden") {
    return { ...event, title: HIDDEN_REQUEST_TITLE, summary: summaryIsTheAsk ? "" : event.summary };
  }
  const ask = event.requestText?.trim() || event.title;
  return {
    ...event,
    title: requestTextAtLevel(ask, level, SUMMARY_TITLE_CHARS) || HIDDEN_REQUEST_TITLE,
    summary: summaryIsTheAsk ? requestTextAtLevel(event.summary, level) : event.summary,
  };
}

/** What a session title known to be the user's first request reads as at 숨김. */
export const HIDDEN_SESSION_TITLE = "제목 숨김";

/**
 * A session's title as a derived view shows it. Only a title known to be the
 * user's first request (`titleFromRequest`) follows the request disclosure
 * level, the same way a request-titled event does: 요약 its first sentence,
 * 요지 the intent line, 숨김 "제목 숨김". A title of the agent's own, a
 * summary or a name the user gave stays as it is. Display only.
 */
export function sessionTitleForView(title: string, fromRequest: boolean | undefined, level: DisclosureLevel): string {
  if (!fromRequest || level === "raw" || !title.trim()) return title;
  if (level === "hidden") return HIDDEN_SESSION_TITLE;
  return requestTextAtLevel(title, level, SUMMARY_TITLE_CHARS) || HIDDEN_SESSION_TITLE;
}

/** A session record's title as a derived view shows it (see `sessionTitleForView`). */
export function recordTitleForView(
  record: { title: string; schemaId?: string; properties?: Record<string, unknown> },
  level: DisclosureLevel,
): string {
  return sessionTitleForView(record.title, record.properties?.titleFromRequest === true, level);
}

/** A live request's text as a title at a disclosure level: as written at 원문,
 *  the level's projection at 요약 / 요지, "숨긴 요청" at 숨김. Live requests
 *  have no per-request override. */
export function requestTitleForView(text: string, level: DisclosureLevel): string {
  if (level === "raw" || !text.trim()) return text;
  if (level === "hidden") return HIDDEN_REQUEST_TITLE;
  return requestTextAtLevel(text, level, SUMMARY_TITLE_CHARS) || HIDDEN_REQUEST_TITLE;
}


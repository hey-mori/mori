/**
 * Language provider contract · WHO computes a language action.
 *
 * The third separation, after capture (where text came from) and action (what
 * the user wants). A provider is swappable: the current Ask Mori LLM port is
 * the first adapter, and a cloud MT service, a local MT model, or a test
 * fixture can register beside it without the domain or UI learning anything
 * about them.
 *
 * Honesty rules encoded here:
 *  - `processingLocation` is never guessed. A provider that does not declare
 *    where it runs is `unknown`, not optimistically `local`.
 *  - A fixture is always labelled `fixture`, so a canned answer can never be
 *    mistaken for a real translation.
 *  - Metadata carries NO secrets: no API key, no endpoint with a secret query,
 *    and never the prompt or the user's text.
 */
import type { LanguageActionResult } from "./languageAction";
import type { SelectionKind } from "./selectionKind";

/** Where a provider computes its answer. Never inferred. */
export type ProcessingLocation = "local" | "cloud" | "fixture" | "unknown";

/** Stable identity + capability of a provider, independent of any run. */
export type LanguageProviderInfo = {
  providerId: string;
  providerDisplayName: string;
  processingLocation: ProcessingLocation;
  /** Actions this provider can serve; the UI hides what it cannot do. */
  supportedActions: ReadonlyArray<"understand" | "express">;
  /** Model identifier when the provider exposes one. */
  model?: string;
};

/** Everything known about one execution, for the detail view and diagnostics. */
export type LanguageRunMetadata = {
  providerId: string;
  providerDisplayName: string;
  processingLocation: ProcessingLocation;
  model?: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  action: "understand" | "express";
  sourceLanguage: string;
  targetLanguage: string;
  explanationLanguage: string;
  captureOrigin: string;
  acquiredBy: string;
  /** Which answer shape was requested. Recorded so a surprising answer can be
   *  traced to the classification that produced it. */
  selectionKind: SelectionKind;
};

/** Why a run failed, so the surface can respond differently per cause. */
export type LanguageErrorKind =
  | "no-engine"
  | "unreachable"
  | "timeout"
  | "empty-reply"
  | "cancelled"
  | "unknown";

export class LanguageProviderError extends Error {
  readonly kind: LanguageErrorKind;
  constructor(kind: LanguageErrorKind, message: string) {
    super(message);
    this.name = "LanguageProviderError";
    this.kind = kind;
  }
}

/** Classify an arbitrary thrown value into an actionable error kind. */
export function classifyProviderError(error: unknown): LanguageProviderError {
  if (error instanceof LanguageProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|cancel/i.test(message)) {
    return new LanguageProviderError("cancelled", "요청이 취소됐습니다.");
  }
  if (/timeout|timed out/i.test(message)) {
    return new LanguageProviderError("timeout", "엔진 응답이 시간 내에 오지 않았습니다.");
  }
  if (/fetch|network|connect|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return new LanguageProviderError("unreachable", "분석 엔진에 연결할 수 없습니다.");
  }
  return new LanguageProviderError("unknown", message || "엔진 호출에 실패했습니다.");
}

/** A completed run: what the user reads, plus how it was produced. */
export type LanguageRun = {
  result: LanguageActionResult;
  metadata: LanguageRunMetadata;
};

/**
 * The seam every provider implements. `execute` receives already-built prompts
 * so a provider never re-derives intent, and an `AbortSignal` so a superseded
 * request (the user switched action) can be dropped rather than land late.
 */
export type LanguageProvider = {
  info: LanguageProviderInfo;
  execute: (input: {
    systemPrompt: string;
    userPrompt: string;
    signal?: AbortSignal;
  }) => Promise<string>;
};

/** Plain-Korean label for where processing happened. */
export function processingLocationLabel(location: ProcessingLocation): string {
  switch (location) {
    case "local":
      return "이 기기에서 처리";
    case "cloud":
      return "외부로 전송";
    case "fixture":
      return "테스트 픽스처";
    default:
      return "처리 위치 불명";
  }
}

/**
 * Language capture contract · WHERE a piece of language came from.
 *
 * CANONICAL PRODUCT BOUNDARY: Mori Language is not a translation feature for
 * Mori's own screens. It is a global language interface — the user meets English
 * in Claude Code, a browser, a PDF, an editor, a terminal, a messenger, and
 * should be able to understand and express it without leaving that app.
 *
 * So Mori's internal selection is ONE adapter, not the product. Direct input is
 * one adapter. Windows OS selection, macOS selection, a browser extension, and
 * screen-region OCR are each one adapter. Every adapter produces the same
 * `LanguageCaptureRequest` and calls the same language actions.
 *
 * Rules this file exists to enforce:
 *  - No DOM types here. A `Range`, an `Element`, or a Tauri handle in this module
 *    would deform every future adapter into looking like a web selection.
 *  - Context is STRUCTURED, never one `contextLabel` string, so a consumer can
 *    tell an app name from a URL from a file path.
 *  - Context is only ever what was actually acquired. Every field is optional and
 *    `acquiredBy` is required, so a reader can always tell how it was obtained
 *    (and the model is never handed invented provenance as if it were fact).
 *  - Text and screen images are not the same thing: `contentType` discriminates,
 *    and `text` is optional precisely because an image capture has none yet.
 *  - Capture is separate from the language action. This module never builds a
 *    prompt; `languageAction.ts` never knows how the text was obtained.
 */

/** Which adapter produced this capture. Adding one must not reshape consumers. */
export type LanguageCaptureOrigin =
  | "mori-selection"
  | "direct-input"
  | "os-selection"
  | "browser-selection"
  | "screen-region"
  | "file"
  | "other";

export type LanguageContentType = "text" | "image" | "mixed";

/**
 * What was captured. `text` is absent for a not-yet-recognized screen region,
 * so a consumer must branch on `contentType` rather than assume text exists.
 */
export type CapturedLanguageContent = {
  contentType: LanguageContentType;
  /** The captured text, when the adapter obtained any. */
  text?: string;
  /** Opaque handle to a captured image (screen region), resolved by the adapter
   *  that made it. Deliberately a string ref, never an image object. */
  imageRef?: string;
};

/**
 * Where the capture came from, as separate observed facts. Every field is
 * optional because adapters differ in what they can see: an OS selection may
 * know the process and window title but no URL; a browser extension may know the
 * URL and author but not a file path.
 */
export type CapturedLanguageContext = {
  appName?: string;
  processName?: string;
  windowTitle?: string;
  url?: string;
  filePath?: string;
  /** Text around the selection, when the adapter could read it honestly. */
  surroundingText?: string;
  /** A project this likely belongs to, for later linking. A hint, not a link. */
  projectHint?: string;
  /** How the text was obtained, e.g. "dom-selection", "ui-automation",
   *  "copy-on-invoke", "manual-input". Required so the panel can always tell the
   *  user how it got the text, and so a fallback is never silently invisible. */
  acquiredBy: string;
  /** Adapter's confidence that the capture is what the user meant (0..1). */
  confidence?: number;
};

/** What the user wants done with the captured language. */
export type LanguageAction = "understand" | "express" | "ask";

/**
 * How long this capture may live. `ephemeral` is the default everywhere: running
 * an action must never itself create durable user content (the lesson from
 * auto-persisting low-signal captures). Persistence is a separate user act.
 */
export type RetentionIntent = "ephemeral" | "temporary" | "persistent";

export type LanguageCaptureRequest = {
  origin: LanguageCaptureOrigin;
  content: CapturedLanguageContent;
  context: CapturedLanguageContext;
  action: LanguageAction;
  retentionIntent: RetentionIntent;
};

/** Selections shorter than this are noise (a double-clicked word is fine). */
export const MIN_CAPTURE_LENGTH = 2;
/** Cap what is sent to an engine · a whole-transcript selection is not a reading
 *  question, and huge prompts only slow the answer down. */
export const MAX_CAPTURE_LENGTH = 2_000;

/** The capture's text, trimmed and clamped to the engine limit. */
export function captureText(request: LanguageCaptureRequest): string {
  return (request.content.text ?? "").trim().slice(0, MAX_CAPTURE_LENGTH);
}

/**
 * Whether a raw string is worth offering a language action for. A double-clicked
 * word qualifies; a stray character or whitespace does not. Adapters call this
 * BEFORE they have a request (a selection listener deciding whether to show a
 * chip), which is why it takes a string rather than a capture.
 */
export function isActionableText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= MIN_CAPTURE_LENGTH && /\S/.test(trimmed);
}

/** Whether a capture carries enough text for a language action to run. */
export function hasActionableText(request: LanguageCaptureRequest): boolean {
  return isActionableText(request.content.text ?? "");
}

/**
 * A short, human-readable source line for the panel and the prompt, built ONLY
 * from context that was actually acquired. Returns undefined when nothing was,
 * so no caller can present invented provenance.
 */
export function describeCaptureSource(context: CapturedLanguageContext): string | undefined {
  const parts = [
    context.appName,
    context.windowTitle,
    context.url,
    context.filePath,
    // Last: an in-app capture has no window title, but it does know the project
    // or session it came from, and that is its honest source.
    context.projectHint,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);
  if (parts.length === 0) return undefined;
  // Keep it to the two most identifying facts; the panel shows the rest.
  return parts.slice(0, 2).join(" · ");
}

/** Build a capture request for text the user typed directly into Mori. */
export function directInputCapture(
  text: string,
  action: LanguageAction,
  context: Partial<CapturedLanguageContext> = {},
): LanguageCaptureRequest {
  return {
    origin: "direct-input",
    content: { contentType: "text", text },
    context: { ...context, acquiredBy: "manual-input" },
    action,
    retentionIntent: "ephemeral",
  };
}

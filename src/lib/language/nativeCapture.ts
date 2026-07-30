/**
 * Typed bridge to the native capture commands · the OS-selection adapter's
 * TypeScript half.
 *
 * Mirrors `src-tauri/src/language/capture.rs`. Kept as its own module so the
 * overlay component never imports Tauri APIs directly: in a browser dev server
 * there is no native side at all, and every function here degrades to the
 * honest "no adapter" answer rather than throwing at import time.
 *
 * Nothing here decides policy. The native side already applied the secure-input
 * rule and the length cap; this only translates the result into the shared
 * `LanguageCaptureRequest` the rest of the loop consumes.
 */
import { isTauriRuntime } from "../desktop/environment";
import type { LanguageAction, LanguageCaptureRequest } from "./languageCapture";

export type AnchorPoint = { x: number; y: number };

export type ObservedContext = {
  appName?: string | null;
  processName?: string | null;
  windowTitle?: string | null;
};

/** Discriminated exactly like the Rust enum's serde tag. */
export type CaptureOutcome =
  | {
      kind: "selection";
      text: string;
      context: ObservedContext;
      anchor?: AnchorPoint | null;
      acquiredBy: string;
    }
  | { kind: "secureInput"; context: ObservedContext }
  | { kind: "noSelection"; context: ObservedContext; anchor?: AnchorPoint | null }
  | { kind: "permissionDenied"; context: ObservedContext }
  | { kind: "unsupported"; platform: string };

export type OverlayPayload = {
  outcome: CaptureOutcome;
  clipboardFallbackAvailable: boolean;
  /** Whether the window is pinned in place. Comes from the native side so the
   *  header toggle cannot drift from the window's real behaviour. */
  pinned: boolean;
};

/** The event the native side emits into the overlay window. */
export const CAPTURE_EVENT = "language://capture";

/** Whether this build is running inside the Tauri shell. */
export function isNativeHost(): boolean {
  return isTauriRuntime();
}

/** Imported lazily so the browser dev server never pulls in the Tauri bundle
 *  just to render the in-app dialog, which has no native dependency at all. */
async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

/** Read the current selection from the focused app. */
export async function captureForegroundSelection(): Promise<CaptureOutcome> {
  if (!isNativeHost()) return { kind: "unsupported", platform: "web" };
  return invokeNative<CaptureOutcome>("capture_foreground_selection");
}

/** The explicit copy-on-invoke fallback. Only ever called from a user gesture. */
export async function captureViaClipboard(): Promise<CaptureOutcome> {
  if (!isNativeHost()) return { kind: "unsupported", platform: "web" };
  return invokeNative<CaptureOutcome>("capture_selection_via_clipboard");
}

export async function closeOverlay(): Promise<void> {
  if (!isNativeHost()) return;
  await invokeNative<void>("close_language_overlay");
}

/** Pin or unpin the overlay's position. */
export async function setOverlayPinned(pinned: boolean): Promise<void> {
  if (!isNativeHost()) return;
  await invokeNative<void>("set_language_overlay_pinned", { pinned });
}

/**
 * Re-read the selection without closing the overlay.
 *
 * The native side hides the window first so focus returns to the app
 * underneath; reading while the overlay has focus would read the overlay.
 */
export async function recaptureSelection(): Promise<CaptureOutcome> {
  if (!isNativeHost()) return { kind: "unsupported", platform: "web" };
  return invokeNative<CaptureOutcome>("recapture_language_selection");
}

/** Drop a null or blank field rather than passing it on as an observed fact. */
function present(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Turn a native outcome into the shared capture request.
 *
 * Only outcomes that actually carry text produce a request; everything else is
 * a state the overlay renders directly, which is why this returns `null` rather
 * than a request with empty text that would then look like an engine failure.
 */
export function toCaptureRequest(
  outcome: CaptureOutcome,
  action: LanguageAction,
): LanguageCaptureRequest | null {
  if (outcome.kind !== "selection") return null;
  return {
    origin: "os-selection",
    content: { contentType: "text", text: outcome.text },
    context: {
      appName: present(outcome.context.appName),
      processName: present(outcome.context.processName),
      windowTitle: present(outcome.context.windowTitle),
      acquiredBy: outcome.acquiredBy,
    },
    action,
    // Reading another app's text must never itself create durable content.
    retentionIntent: "ephemeral",
  };
}

/** The context to show for an outcome that carries no text. */
export function outcomeContext(outcome: CaptureOutcome): ObservedContext {
  return outcome.kind === "unsupported" ? {} : outcome.context;
}

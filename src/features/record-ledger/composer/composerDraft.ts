/**
 * Composer draft · a local recovery copy of in-progress text
 * (record-workspace spec, approved refinement 5.1).
 *
 * This is deliberately NOT a kernel object: while typing, nothing enters
 * permanent storage. The draft exists so an app restart or crash never eats
 * a half-written thought; it is removed on successful save or explicit
 * clear, and it never leaves the device.
 */

const DRAFT_KEY = "mori.record-composer.draft";

export type ComposerDraft = {
  text: string;
  savedAt: string;
};

export function loadComposerDraft(): ComposerDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposerDraft;
    if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveComposerDraft(text: string): void {
  try {
    if (text.trim().length === 0) {
      window.localStorage.removeItem(DRAFT_KEY);
      return;
    }
    const draft: ComposerDraft = { text, savedAt: new Date().toISOString() };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage may be unavailable (private mode, quota); typing must not break.
  }
}

export function clearComposerDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Same guard as above.
  }
}

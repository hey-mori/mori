/**
 * Language-tool preferences · the small set of choices that should OUTLIVE one
 * capture.
 *
 * Carefully not the same thing as retention. A capture and its result are
 * ephemeral by rule and are never written anywhere. What is stored here is
 * configuration the user set on purpose, and re-asking for it every time the
 * overlay opens is friction with no privacy benefit:
 *
 *  - the language pair, which almost never changes for a given person
 *  - whether they last used 이해 or 표현
 *
 * Nothing here can hold captured text. The types make that structural rather
 * than a promise: there is no field a selection could be put in.
 */
import { DEFAULT_LANGUAGE_PROFILE, type LanguageProfile } from "./languageAction";

const STORAGE_KEY = "mori.language.preferences.v1";

export type LanguagePreferences = {
  profile: LanguageProfile;
  lastAction: "understand" | "express";
};

export const DEFAULT_LANGUAGE_PREFERENCES: LanguagePreferences = {
  profile: DEFAULT_LANGUAGE_PROFILE,
  lastAction: "understand",
};

/** A language tag we are willing to store: short, alphabetic, no payload. */
function isLanguageCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]{2,8}(-[a-z0-9]{2,8})?$/i.test(value);
}

/**
 * Read the stored preferences, falling back field by field.
 *
 * Validated rather than trusted: this is the one language module that reads
 * back something previously written, so a corrupted or hand-edited store must
 * degrade to defaults instead of putting arbitrary strings into a prompt.
 */
export function loadLanguagePreferences(): LanguagePreferences {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LANGUAGE_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_LANGUAGE_PREFERENCES;

    const record = parsed as Record<string, unknown>;
    const profile = record.profile as Record<string, unknown> | undefined;
    const explanation = profile?.explanationLanguage;
    const target = profile?.targetLanguage;

    return {
      profile: {
        explanationLanguage: isLanguageCode(explanation)
          ? explanation
          : DEFAULT_LANGUAGE_PROFILE.explanationLanguage,
        targetLanguage: isLanguageCode(target)
          ? target
          : DEFAULT_LANGUAGE_PROFILE.targetLanguage,
      },
      lastAction: record.lastAction === "express" ? "express" : "understand",
    };
  } catch {
    return DEFAULT_LANGUAGE_PREFERENCES;
  }
}

/** Persist preferences. Best-effort: a full store must not break the tool. */
export function saveLanguagePreferences(preferences: LanguagePreferences): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profile: {
          explanationLanguage: preferences.profile.explanationLanguage,
          targetLanguage: preferences.profile.targetLanguage,
        },
        lastAction: preferences.lastAction,
      }),
    );
  } catch {
    // Preferences are a convenience; losing them costs two dropdown changes.
  }
}

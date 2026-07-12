/**
 * First-run onboarding state.
 *
 * Mori has no server and no account, so "has this person been onboarded" is a
 * tiny local flag, mirroring `lib/profile/localProfile.ts`: a `mori.`-prefixed
 * localStorage key, a schema version, tolerant parse-with-fallback, and a
 * quota-safe write. Combined with a zero-session check at the call site, the
 * first-run guide shows once and never nags: completing or dismissing it sets
 * `completed`, and any real work makes the session count non-zero.
 */

const ONBOARDING_KEY = "mori.onboarding";
const ONBOARDING_SCHEMA_VERSION = 1 as const;

export type OnboardingState = {
  schemaVersion: typeof ONBOARDING_SCHEMA_VERSION;
  /** True once the user finished or dismissed the first-run guide. */
  completed: boolean;
  /** ISO timestamp of the dismissal / completion, or null if never. */
  dismissedAt: string | null;
};

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  schemaVersion: ONBOARDING_SCHEMA_VERSION,
  completed: false,
  dismissedAt: null,
};

/** Parse a stored payload; unknown / malformed / wrong-version resets to default. */
export function parseOnboardingState(raw: string | null): OnboardingState {
  if (!raw) return DEFAULT_ONBOARDING_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    if (parsed.schemaVersion !== ONBOARDING_SCHEMA_VERSION) {
      return DEFAULT_ONBOARDING_STATE;
    }
    return {
      schemaVersion: ONBOARDING_SCHEMA_VERSION,
      completed: parsed.completed === true,
      dismissedAt: typeof parsed.dismissedAt === "string" ? parsed.dismissedAt : null,
    };
  } catch {
    return DEFAULT_ONBOARDING_STATE;
  }
}

export function serializeOnboardingState(state: OnboardingState): string {
  return JSON.stringify(state);
}

export function loadOnboardingState(): OnboardingState {
  if (typeof window === "undefined") return DEFAULT_ONBOARDING_STATE;
  try {
    return parseOnboardingState(window.localStorage.getItem(ONBOARDING_KEY));
  } catch {
    return DEFAULT_ONBOARDING_STATE;
  }
}

export function saveOnboardingState(state: OnboardingState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_KEY, serializeOnboardingState(state));
  } catch {
    // localStorage can be unavailable (private mode / quota); a failed write
    // just means the guide may show again next launch, never a crash.
  }
}

/** Build the completed state, stamped with the moment it was dismissed. */
export function markOnboardingCompleted(dismissedAt: string): OnboardingState {
  return { schemaVersion: ONBOARDING_SCHEMA_VERSION, completed: true, dismissedAt };
}

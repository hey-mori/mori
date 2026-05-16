/**
 * Local profile — Mori's default identity.
 *
 * Mori opens straight into a usable Local Mode with no account. The
 * local profile is just a user-set display name held in browser
 * localStorage; it is never an account, never proves identity to any
 * server, and never grants data access. A Mori Account (sync, backup,
 * billing) is a separate, always-optional, planned capability.
 *
 * See `docs/account-profile-settings-references.md` §2.
 */

const PROFILE_KEY = "mori.localProfile";
const PROFILE_SCHEMA_VERSION = 1 as const;
const MAX_DISPLAY_NAME_LENGTH = 60;

export type MoriLocalProfile = {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  /** User-set display name for the local profile. */
  displayName: string;
};

export const DEFAULT_LOCAL_PROFILE: MoriLocalProfile = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  displayName: "Kim Mori",
};

/** Trim and length-cap a display name before it is stored or shown. */
export function normalizeDisplayName(raw: string): string {
  return raw.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
}

/**
 * Up-to-two-character avatar initials derived from a display name.
 * Two words → first letter of each; one word → first two characters;
 * empty → a neutral dot.
 */
export function getProfileInitials(displayName: string): string {
  const name = displayName.trim();
  if (!name) return "·";
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Parse a stored profile string into a valid `MoriLocalProfile`.
 * Unknown / malformed / wrong-version payloads fall back to the
 * default rather than corrupting the surface.
 */
export function parseLocalProfile(raw: string | null): MoriLocalProfile {
  if (!raw) return DEFAULT_LOCAL_PROFILE;
  try {
    const parsed = JSON.parse(raw) as Partial<MoriLocalProfile>;
    if (parsed.schemaVersion !== PROFILE_SCHEMA_VERSION) {
      return DEFAULT_LOCAL_PROFILE;
    }
    if (typeof parsed.displayName !== "string") {
      return DEFAULT_LOCAL_PROFILE;
    }
    const displayName = normalizeDisplayName(parsed.displayName);
    return {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      displayName: displayName || DEFAULT_LOCAL_PROFILE.displayName,
    };
  } catch {
    return DEFAULT_LOCAL_PROFILE;
  }
}

/** Serialize a profile for storage. */
export function serializeLocalProfile(profile: MoriLocalProfile): string {
  return JSON.stringify(profile);
}

/** Read the local profile from browser localStorage. */
export function loadLocalProfile(): MoriLocalProfile {
  if (typeof window === "undefined") return DEFAULT_LOCAL_PROFILE;
  try {
    return parseLocalProfile(window.localStorage.getItem(PROFILE_KEY));
  } catch {
    return DEFAULT_LOCAL_PROFILE;
  }
}

/** Persist the local profile to browser localStorage. */
export function saveLocalProfile(profile: MoriLocalProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_KEY, serializeLocalProfile(profile));
  } catch {
    // localStorage can be unavailable (private mode / quota); a failed
    // write just means the name is not persisted, not a crash.
  }
}

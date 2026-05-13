import type {
  MoriRepositoryConfig,
  RepositoryVerificationMetadata,
} from "./repositorySettings";

/**
 * Default threshold beyond which a successful verification is treated as
 * stale and the UI suggests Re-verify. Centralized so tests can rely on a
 * fixed value and future tuning happens in one place.
 */
export const STALE_VERIFICATION_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export type VerificationFreshnessTone = "unverified" | "fresh" | "stale" | "failed";

export type VerificationFreshness = {
  tone: VerificationFreshnessTone;
  label: string;
  ageLabel: string | null;
  ageMs: number | null;
  isStale: boolean;
};

export type VerificationFreshnessOptions = {
  now?: number;
  thresholdMs?: number;
};

/**
 * Compute a structured freshness descriptor for repository verification
 * metadata. Treats invalid timestamps (`"epoch:..."` or otherwise unparsable)
 * gracefully — the verification is still considered fresh, but no age label
 * is produced. This lets the UI render badges without exception handling.
 */
export function getRepositoryVerificationFreshness(
  verification: RepositoryVerificationMetadata | undefined,
  options: VerificationFreshnessOptions = {},
): VerificationFreshness {
  if (!verification || verification.status === "unverified") {
    return { tone: "unverified", label: "Unverified", ageLabel: null, ageMs: null, isStale: false };
  }

  if (verification.status === "failed") {
    const detail = verification.error ? `: ${verification.error}` : "";
    return { tone: "failed", label: `Verification failed${detail}`, ageLabel: null, ageMs: null, isStale: false };
  }

  const ageMs = computeAgeMs(verification.verifiedAt, options.now);
  const threshold = options.thresholdMs ?? STALE_VERIFICATION_THRESHOLD_MS;
  const ageLabel = ageMs !== null ? formatAge(ageMs) : null;
  const isStale = ageMs !== null && ageMs >= threshold;
  const tone: VerificationFreshnessTone = isStale ? "stale" : "fresh";

  const verifiedFragment = ageLabel ? `Verified ${ageLabel}` : "Verified";
  const label = isStale ? `Stale verification · ${ageLabel ?? ""}`.trim() : verifiedFragment;
  return { tone, label, ageLabel, ageMs, isStale };
}

export function getRepositoryFreshness(
  repository: MoriRepositoryConfig,
  options?: VerificationFreshnessOptions,
): VerificationFreshness {
  return getRepositoryVerificationFreshness(repository.verification, options);
}

export function isRepositoryVerificationStale(
  verification: RepositoryVerificationMetadata | undefined,
  options?: VerificationFreshnessOptions,
): boolean {
  return getRepositoryVerificationFreshness(verification, options).isStale;
}

export function formatVerificationAge(verifiedAt: string | undefined, now?: number): string | null {
  const ageMs = computeAgeMs(verifiedAt, now);
  if (ageMs === null) return null;
  return formatAge(ageMs);
}

function computeAgeMs(verifiedAt: string | undefined, now?: number): number | null {
  if (!verifiedAt) return null;
  const parsed = parseTimestamp(verifiedAt);
  if (parsed === null) return null;
  const reference = now ?? Date.now();
  const age = reference - parsed;
  if (!Number.isFinite(age)) return null;
  if (age < 0) return 0;
  return age;
}

/**
 * Accepts ISO-8601 strings *and* the `"epoch:<seconds>"` placeholder format
 * that the current Rust verification command emits while a real time crate is
 * deferred to a later milestone.
 */
function parseTimestamp(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("epoch:")) {
    const seconds = Number(trimmed.slice("epoch:".length));
    if (!Number.isFinite(seconds)) return null;
    return seconds * 1000;
  }
  const ts = Date.parse(trimmed);
  return Number.isFinite(ts) ? ts : null;
}

function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 2) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 2) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 2) return "1 day ago";
  return `${days} days ago`;
}

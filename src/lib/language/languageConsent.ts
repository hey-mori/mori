/**
 * Cloud-transmission consent · the policy boundary for sending captured text to
 * an external provider.
 *
 * Types and rules only. No UI, no storage: G1 decides where grants live after
 * the settings store is audited, and until then a grant that could not be
 * persisted must degrade to memory-only rather than pretend to be permanent.
 *
 * Invariants:
 *  - A grant NEVER contains captured text. It records who may receive text, not
 *    what was sent.
 *  - Secure input and blocked apps outrank any grant. Consent is permission to
 *    send ordinary text, never an override for a password field.
 *  - Consent never transfers between providers: allowing one cloud vendor says
 *    nothing about the next.
 *  - Local and fixture providers never require cloud consent, because nothing
 *    leaves the machine.
 */
import type { ProcessingLocation } from "./languageProvider";

/** How far a grant reaches. Deliberately ordered narrow to broad. */
export type ConsentScope = "once" | "session" | "provider" | "application";

export type ProviderConsentGrant = {
  /** Schema version, so a stored grant can be migrated or invalidated. */
  version: number;
  providerId: string;
  scope: ConsentScope;
  /** The app the capture came from, for an `application`-scoped grant. */
  applicationId?: string;
  createdAt: string;
  updatedAt: string;
  /** False when the grant could not be persisted · it lives only in memory and
   *  must be re-asked next launch. Never shown as a permanent allow. */
  durable: boolean;
};

export const CONSENT_GRANT_VERSION = 1;

/** Facts about the capture that consent is being evaluated against. */
export type ConsentContext = {
  providerId: string;
  processingLocation: ProcessingLocation;
  /** The source app / process, when the adapter knew one. */
  applicationId?: string;
  /** UI Automation reported a password or otherwise secure field. */
  isSecureInput?: boolean;
  /** The user (or policy) blocked this app from language capture. */
  isBlockedApp?: boolean;
};

export type ConsentDecision =
  | { outcome: "allowed"; reason: "local" | "fixture" | "granted" }
  | { outcome: "ask" }
  | { outcome: "blocked"; reason: "secure-input" | "blocked-app" };

/**
 * Decide whether a capture may be sent to its provider.
 *
 * Order matters: the two hard blocks are checked BEFORE any grant, so no
 * previously-given consent can be used to read a password field or a blocked
 * application.
 */
export function evaluateConsent(
  context: ConsentContext,
  grants: readonly ProviderConsentGrant[],
): ConsentDecision {
  if (context.isSecureInput) return { outcome: "blocked", reason: "secure-input" };
  if (context.isBlockedApp) return { outcome: "blocked", reason: "blocked-app" };

  // Nothing leaves the machine, so there is nothing to consent to.
  if (context.processingLocation === "local") return { outcome: "allowed", reason: "local" };
  if (context.processingLocation === "fixture") return { outcome: "allowed", reason: "fixture" };

  // An unknown location is treated as external: we never assume it is safe.
  const match = grants.find(
    (grant) =>
      grant.providerId === context.providerId &&
      (grant.scope === "provider" ||
        grant.scope === "session" ||
        (grant.scope === "application" &&
          !!context.applicationId &&
          grant.applicationId === context.applicationId)),
  );
  return match ? { outcome: "allowed", reason: "granted" } : { outcome: "ask" };
}

/** Create a grant. `durable: false` records that persistence failed, so the UI
 *  can say it lasts only for this run instead of claiming it was saved. */
export function createConsentGrant(input: {
  providerId: string;
  scope: ConsentScope;
  applicationId?: string;
  now: string;
  durable: boolean;
}): ProviderConsentGrant {
  return {
    version: CONSENT_GRANT_VERSION,
    providerId: input.providerId,
    scope: input.scope,
    applicationId: input.scope === "application" ? input.applicationId : undefined,
    createdAt: input.now,
    updatedAt: input.now,
    durable: input.durable,
  };
}

/** Remove every grant for a provider · the revoke path. */
export function revokeProvider(
  grants: readonly ProviderConsentGrant[],
  providerId: string,
): ProviderConsentGrant[] {
  return grants.filter((grant) => grant.providerId !== providerId);
}

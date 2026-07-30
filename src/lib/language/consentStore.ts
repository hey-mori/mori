/**
 * Where consent grants live, until the storage audit in issue #12 lands.
 *
 * `languageConsent.ts` decides IF text may be sent. This decides WHERE that
 * answer is remembered, and it is deliberately the smaller, more pessimistic
 * half:
 *
 *  - The in-memory map is the source of truth for the running process. It always
 *    works, and it always forgets on quit.
 *  - `localStorage` is a best-effort mirror, nothing more. Issue #12 documents
 *    that the web store is quota-exhausted and unreliable, so a write that
 *    throws must NOT produce a grant that claims to be permanent.
 *  - A grant whose mirror failed is returned with `durable: false`, and the UI
 *    is required to describe it as lasting only for this run. Telling someone
 *    their choice was saved when it was not is worse than asking again.
 *
 * `provider`-scoped grants are the broadest thing storable today. There is no
 * `application` scope UI yet precisely because per-app trust needs durable
 * storage to be meaningful across launches.
 */
import {
  createConsentGrant,
  revokeProvider,
  type ConsentScope,
  type ProviderConsentGrant,
} from "./languageConsent";

const STORAGE_KEY = "mori.language.consent.v1";

/** Session-scoped grants never touch storage: they are meant to die on quit. */
const EPHEMERAL_SCOPES: ReadonlySet<ConsentScope> = new Set<ConsentScope>(["once", "session"]);

let memory: ProviderConsentGrant[] = [];
let hydrated = false;

/** Read the mirror once per process. A corrupt or unreadable store is treated as
 *  "no grants", never as an error the user must resolve before translating. */
function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    memory = parsed.filter(
      (entry): entry is ProviderConsentGrant =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as ProviderConsentGrant).providerId === "string" &&
        typeof (entry as ProviderConsentGrant).scope === "string",
    );
  } catch {
    memory = [];
  }
}

/** Mirror durable grants. Returns whether the write actually succeeded.
 *
 * A missing store is a FAILED write, not a silent success. Optional-chaining
 * into `undefined` and returning true would report a grant as permanent in
 * exactly the environments where nothing was written at all. */
function persist(): boolean {
  const store = globalThis.localStorage;
  if (!store) return false;
  const durable = memory.filter((grant) => !EPHEMERAL_SCOPES.has(grant.scope));
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(durable));
    return true;
  } catch {
    // Quota exhaustion (issue #12) or a private-mode store. Not fatal: the
    // in-memory grant still works for this run and is reported as such.
    return false;
  }
}

export function listGrants(): ProviderConsentGrant[] {
  hydrate();
  return memory;
}

/**
 * Record a grant and report it back with an HONEST `durable` flag.
 *
 * The returned grant is what the UI must describe, not the one that was
 * requested: asking for a permanent allow and getting a session allow is a
 * different promise, and the difference has to reach the user.
 */
export function grantConsent(input: {
  providerId: string;
  scope: ConsentScope;
  applicationId?: string;
  now?: string;
}): ProviderConsentGrant {
  hydrate();
  const provisional = createConsentGrant({
    providerId: input.providerId,
    scope: input.scope,
    applicationId: input.applicationId,
    now: input.now ?? new Date().toISOString(),
    // Assumed true, corrected below by what the write actually did.
    durable: true,
  });

  // One grant per provider: re-granting replaces rather than stacking, so a
  // narrower later choice cannot be silently outvoted by an older broad one.
  memory = [...revokeProvider(memory, input.providerId), provisional];

  const wrote = EPHEMERAL_SCOPES.has(input.scope) ? false : persist();
  const settled: ProviderConsentGrant = { ...provisional, durable: wrote };
  memory = memory.map((grant) => (grant === provisional ? settled : grant));
  return settled;
}

/** Withdraw every grant for a provider. */
export function revokeConsent(providerId: string): void {
  hydrate();
  memory = revokeProvider(memory, providerId);
  persist();
}

/* ── Blocked applications ──────────────────────────────────────────────────
 *
 * A per-app kill switch, stored beside the grants because it is the same kind
 * of decision inverted. It outranks every grant (see `evaluateConsent`), so a
 * user who blocks their password manager cannot later be talked into sending
 * text from it by a broad provider-scoped allow.
 *
 * Matching is on the process name the adapter observed, lower-cased. Deliberately
 * not on a window title: a title changes with the document, a process does not.
 */
const BLOCKED_KEY = "mori.language.blockedApps.v1";

let blocked: string[] = [];
let blockedHydrated = false;

function hydrateBlocked(): void {
  if (blockedHydrated) return;
  blockedHydrated = true;
  try {
    const raw = globalThis.localStorage?.getItem(BLOCKED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    blocked = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    blocked = [];
  }
}

function normalizeApp(app: string): string {
  return app.trim().toLowerCase();
}

export function listBlockedApps(): string[] {
  hydrateBlocked();
  return blocked;
}

export function isAppBlocked(app: string | undefined): boolean {
  if (!app) return false;
  hydrateBlocked();
  return blocked.includes(normalizeApp(app));
}

export function blockApp(app: string): void {
  hydrateBlocked();
  const normalized = normalizeApp(app);
  if (!normalized || blocked.includes(normalized)) return;
  blocked = [...blocked, normalized];
  try {
    globalThis.localStorage?.setItem(BLOCKED_KEY, JSON.stringify(blocked));
  } catch {
    // Memory-only for this run. A block that could not be persisted is still
    // enforced now, which is the safe direction to fail in.
  }
}

export function unblockApp(app: string): void {
  hydrateBlocked();
  blocked = blocked.filter((entry) => entry !== normalizeApp(app));
  try {
    globalThis.localStorage?.setItem(BLOCKED_KEY, JSON.stringify(blocked));
  } catch {
    // See `blockApp`.
  }
}

/** Test seam. Never called by product code. */
export function resetConsentStoreForTests(): void {
  memory = [];
  hydrated = false;
  blocked = [];
  blockedHydrated = false;
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
    globalThis.localStorage?.removeItem(BLOCKED_KEY);
  } catch {
    // Nothing to clean up if the store was never reachable.
  }
}

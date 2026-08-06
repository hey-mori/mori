/**
 * Live Intake Buffer · persistence.
 *
 * Follows the house storage conventions (see `record-kernel/kernelStore.ts`):
 * a `mori.liveIntake.*` key prefix over a `KeyValueStorage`, schema-versioned
 * envelopes, and an unknown envelope version loading as null rather than
 * corrupting consumers.
 *
 * Keyed **by session, not by row.** A real store holds thousands of requests
 * across hundreds of sessions, and a key per row would turn one poll into
 * thousands of writes. A session's rows rewrite together, which is also what
 * makes re-observation idempotent: the follower re-derives a session's requests
 * from its accumulated messages every poll, so the newest write is always the
 * complete truth for that session and merging is neither needed nor correct.
 *
 * Quota failures are NOT swallowed. Intake is derived data and is re-derivable
 * from the locator, but a save that silently did nothing would let the overview
 * claim a freshness it does not have, so the typed error propagates exactly as
 * it does for kernel saves.
 */
import {
  isQuotaExceededError,
  notifyQuotaFailure,
  StorageQuotaError,
} from "../storage/storageQuota";
import type { KeyValueStorage } from "../storage/storageTypes";
import type { IntakeRequestRow } from "./intakeTypes";

/**
 * Moves with `INTAKE_ROW_VERSION`, so a row-shape change makes stored data
 * unreadable on purpose and the next poll re-derives it. Dropping is the
 * correct migration for a derived index, and only for one: nothing here is
 * authored, so nothing is lost.
 */
const INTAKE_ENVELOPE_VERSION = 2 as const;
const PREFIX = "mori.liveIntake.session.";

type Envelope = {
  envelopeVersion: typeof INTAKE_ENVELOPE_VERSION;
  savedAt: string;
  data: IntakeRequestRow[];
};

/** A session file path is not key-safe, so it is encoded rather than embedded. */
function sessionStorageKey(sessionKey: string): string {
  return `${PREFIX}${encodeURIComponent(sessionKey)}`;
}

export class IntakeBrowserStore {
  constructor(private readonly storage: KeyValueStorage = window.localStorage) {}

  /** Replace one session's rows. Empty input removes the entry rather than
   *  leaving a hollow record behind. */
  saveSessionRows(sessionKey: string, rows: readonly IntakeRequestRow[]): void {
    const key = sessionStorageKey(sessionKey);
    if (rows.length === 0) {
      this.storage.removeItem(key);
      return;
    }
    const envelope: Envelope = {
      envelopeVersion: INTAKE_ENVELOPE_VERSION,
      savedAt: new Date().toISOString(),
      data: [...rows],
    };
    try {
      this.storage.setItem(key, JSON.stringify(envelope));
    } catch (error) {
      if (isQuotaExceededError(error)) {
        notifyQuotaFailure({ key, at: new Date().toISOString() });
        throw new StorageQuotaError(key, { cause: error });
      }
      throw error;
    }
  }

  listSessionRows(sessionKey: string): IntakeRequestRow[] {
    return this.read(sessionStorageKey(sessionKey)) ?? [];
  }

  /** Every row Mori has observed, newest request first. */
  listAllRows(): IntakeRequestRow[] {
    const rows: IntakeRequestRow[] = [];
    for (let i = 0; i < this.storage.length; i += 1) {
      const key = this.storage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const held = this.read(key);
      if (held) rows.push(...held);
    }
    rows.sort((a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0));
    return rows;
  }

  /** Session file paths this store holds rows for. */
  listSessionKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i += 1) {
      const key = this.storage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      keys.push(decodeURIComponent(key.slice(PREFIX.length)));
    }
    return keys;
  }

  clearSession(sessionKey: string): void {
    this.storage.removeItem(sessionStorageKey(sessionKey));
  }

  private read(key: string): IntakeRequestRow[] | null {
    const raw = this.storage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Envelope;
      if (parsed.envelopeVersion !== INTAKE_ENVELOPE_VERSION) return null;
      return Array.isArray(parsed.data) ? parsed.data : null;
    } catch {
      return null;
    }
  }
}

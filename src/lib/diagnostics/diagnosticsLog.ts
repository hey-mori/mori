/**
 * Local diagnostics log.
 *
 * Mori is local-first: there is no remote telemetry. Instead, uncaught
 * errors and unhandled promise rejections are appended to a small,
 * capped, schema-versioned log in browser storage, and the user can
 * export it from Settings ("진단 내보내기") when reporting a problem.
 *
 * Hard rules:
 *  - The log stores error messages and stacks only — never session
 *    content, source text, or memory bodies.
 *  - Writing diagnostics must never break the app: every write is
 *    guarded, and on quota pressure the log halves itself before
 *    giving up silently.
 */

export const DIAGNOSTICS_STORAGE_KEY = "mori.diagnostics.v1";

/** Cap so the log never grows past a small, exportable size. */
export const DIAGNOSTICS_MAX_ENTRIES = 200;

export type DiagnosticsEntryKind =
  | "error"
  | "unhandledrejection"
  | "storageQuota"
  | "manual";

export type DiagnosticsEntry = {
  at: string;
  kind: DiagnosticsEntryKind;
  message: string;
  stack?: string;
  /** Short free-text context ("source: window.onerror", a view key, …). */
  context?: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readDiagnosticsEntries(storage: StorageLike): DiagnosticsEntry[] {
  try {
    const raw = storage.getItem(DIAGNOSTICS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDiagnosticsEntry);
  } catch {
    return [];
  }
}

/**
 * Append one entry, newest last, dropping the oldest past the cap.
 * On a failed write (quota), retry once with the newer half of the log;
 * if that fails too, give up silently — diagnostics never crash the app.
 */
export function appendDiagnosticsEntry(
  storage: StorageLike,
  entry: DiagnosticsEntry,
  limit: number = DIAGNOSTICS_MAX_ENTRIES,
): void {
  const entries = [...readDiagnosticsEntries(storage), entry].slice(-limit);
  try {
    storage.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    try {
      const halved = entries.slice(-Math.max(1, Math.floor(limit / 2)));
      storage.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify(halved));
    } catch {
      // Give up; never throw from the diagnostics path.
    }
  }
}

export function clearDiagnosticsEntries(storage: StorageLike): void {
  try {
    storage.removeItem(DIAGNOSTICS_STORAGE_KEY);
  } catch {
    // Ignore; clearing is best-effort.
  }
}

export type DiagnosticsReport = {
  schema: "mori.diagnostics.report.v1";
  exportedAt: string;
  app: { name: string; version: string };
  runtime: { userAgent: string; platform: string };
  entryCount: number;
  entries: DiagnosticsEntry[];
  /**
   * Where durable data is actually resting, when that is not where it should
   * be. Present only on a device whose SQLite path failed, so its absence
   * means the normal case rather than "not measured". Optional so the `v1`
   * schema stays readable by anything that already parses it.
   */
  storage?: { fellBackTo: "browser-local-storage"; scope: string; reason: string; at: string };
};

/** Assemble the export payload. Pure: all environment facts come in as args. */
export function buildDiagnosticsReport(input: {
  entries: DiagnosticsEntry[];
  exportedAt: string;
  appVersion: string;
  userAgent: string;
  platform: string;
  storage?: DiagnosticsReport["storage"];
}): DiagnosticsReport {
  return {
    schema: "mori.diagnostics.report.v1",
    exportedAt: input.exportedAt,
    app: { name: "Mori", version: input.appVersion },
    runtime: { userAgent: input.userAgent, platform: input.platform },
    entryCount: input.entries.length,
    entries: input.entries,
    ...(input.storage ? { storage: input.storage } : {}),
  };
}

/** Normalise an unknown thrown value into message + stack. */
export function describeThrown(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return { message: `${value.name}: ${value.message}`, stack: value.stack };
  }
  if (typeof value === "string") return { message: value };
  try {
    return { message: JSON.stringify(value) };
  } catch {
    return { message: String(value) };
  }
}

function isDiagnosticsEntry(value: unknown): value is DiagnosticsEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.at === "string" &&
    typeof entry.kind === "string" &&
    typeof entry.message === "string"
  );
}

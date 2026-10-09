/**
 * The one mapping between a localStorage key and a durable document.
 *
 * Both directions live here on purpose. The adoption pass reads keys and writes
 * documents; the read flip (R6) reads documents and rebuilds keys. If those two
 * ever disagreed about a single prefix, the flip would serve a store missing
 * whatever the disagreement covered, and it would look like data loss rather
 * than like a mapping bug. A round-trip test pins them as inverses.
 */
import { APP_SCOPED_OWNER, type DurableDocumentKind } from "../sqlite/durableDocumentRows";

/**
 * Per-owner classes, stored one key per session or package.
 *
 * `mori.sessionAnalysis.` and `mori.sessionAnalysisHistory.` look like one
 * contains the other and do not: the character after `mori.sessionAnalysis` is
 * `.` in one and `H` in the other. Load-bearing and quiet, so it is tested.
 */
export const DURABLE_PREFIXES: ReadonlyArray<{ prefix: string; kind: DurableDocumentKind }> = [
  { prefix: "mori.sessionMemory.", kind: "memory_body" },
  { prefix: "mori.sessionAnalysisHistory.", kind: "analysis_history" },
  { prefix: "mori.sessionAnalysis.", kind: "analysis" },
  { prefix: "mori.sessionDraft.", kind: "session_draft" },
  { prefix: "mori.sessionPendingReview.", kind: "pending_review" },
  { prefix: "mori.packageDraft.", kind: "package_draft" },
  // An imported transcript is the session's evidence, and for a session whose
  // original is gone it is all there is. The owner is `<sessionId>.<importId>`,
  // the suffix of the per-entry key.
  { prefix: "mori.sessionImportEntry.", kind: "session_import" },
];

/**
 * App-scoped classes: one document for the whole install, under an exact key.
 *
 * Separate from the prefixes because deriving an owner id from the suffix of an
 * exact key gives the empty string, which would collide with any document
 * written from an unset id. They take the reserved owner instead.
 */
export const DURABLE_SINGLETONS: ReadonlyArray<{ key: string; kind: DurableDocumentKind }> = [
  { key: "mori.projectConnections.v1", kind: "project_connections" },
  { key: "mori.userProjects.v1", kind: "user_projects" },
  // What reopening a preserved session needs (agent, import kind, source path).
  // Without it a restored archive exists but cannot be opened.
  { key: "mori.autoImport.v1", kind: "auto_import_descriptors" },
];

/** Which document a localStorage key holds, or `null` when it holds none. */
export function durableKeyToDocument(
  key: string,
): { kind: DurableDocumentKind; ownerId: string } | null {
  const singleton = DURABLE_SINGLETONS.find((entry) => entry.key === key);
  if (singleton) return { kind: singleton.kind, ownerId: APP_SCOPED_OWNER };
  const match = DURABLE_PREFIXES.find((entry) => key.startsWith(entry.prefix));
  if (!match) return null;
  return { kind: match.kind, ownerId: key.slice(match.prefix.length) };
}

/** The localStorage key a document belongs under, or `null` for an unknown kind. */
export function documentToDurableKey(kind: DurableDocumentKind, ownerId: string): string | null {
  const singleton = DURABLE_SINGLETONS.find((entry) => entry.kind === kind);
  if (singleton) return singleton.key;
  const match = DURABLE_PREFIXES.find((entry) => entry.kind === kind);
  if (!match) return null;
  return `${match.prefix}${ownerId}`;
}

/** Every kind this mapping covers, for a caller that reads them all. */
export function durableKinds(): DurableDocumentKind[] {
  return [
    ...DURABLE_PREFIXES.map((entry) => entry.kind),
    ...DURABLE_SINGLETONS.map((entry) => entry.kind),
  ];
}

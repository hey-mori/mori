/**
 * Row shape for the `durable_documents` table (migration `V009`).
 *
 * R1 of `docs/design/sqlite-source-of-truth-promotion.md` §7: the schema,
 * the Rust repository and this bridge exist and are tested, but nothing
 * adopts them yet. Adoption is R2 onward, so landing this changes no
 * behaviour.
 *
 * One table holds every durable class because they share one access pattern:
 * read the whole document for an owner, write it, delete it. Nothing queries
 * inside a body in SQL, since content search belongs to the record kernel and
 * its FTS index. A kind earns its own table when it needs to be found by
 * something other than its owner, which is why live intake is not here.
 */

/**
 * Which durable class a document belongs to.
 *
 * Enumerated here rather than in Rust, which treats `kind` as opaque text.
 * That split is deliberate: adding a kind in R3 or R4 is a TypeScript change
 * and needs no migration and no Rust edit.
 */
export type DurableDocumentKind =
  | "memory_body"
  | "analysis"
  | "analysis_history"
  | "pending_review"
  | "session_draft"
  | "package_draft"
  | "project_connections"
  | "user_projects"
  /** One imported source of a session (its events), owner `<sessionId>.<importId>`. */
  | "session_import"
  /** One auto-registered session's reopen descriptor (how to find its
   *  transcript or archive again), owner = the Mori session id. Not a
   *  localStorage key class: written and merged by the descriptor store. */
  | "reopen_descriptor";

/**
 * The owner id for a class that has exactly one document for the whole app,
 * rather than one per session. A reserved value rather than an empty string,
 * so a row written from an unset id is distinguishable from a deliberate
 * singleton.
 */
export const APP_SCOPED_OWNER = "@app";

export type SqliteDurableDocumentRow = {
  kind: DurableDocumentKind;
  ownerId: string;
  /**
   * The body's schema version, carried as a column so a loader can reject an
   * unknown major without parsing the body first.
   */
  schemaVersion: number;
  /** The document itself, serialised. Opaque to Rust; owned here. */
  bodyJson: string;
  updatedAt: string;
};

export type SqliteDurableDocumentWriteResult = {
  documentsWritten: number;
};

/**
 * Wrap a document for storage.
 *
 * Serialisation lives on this side of the bridge, so a body shape can change
 * without a Rust edit. `updatedAt` is passed in rather than read from the
 * clock here, keeping this pure and testable.
 */
export function toDurableDocumentRow<T>(input: {
  kind: DurableDocumentKind;
  ownerId: string;
  schemaVersion: number;
  body: T;
  updatedAt: string;
}): SqliteDurableDocumentRow {
  return {
    kind: input.kind,
    ownerId: input.ownerId,
    schemaVersion: input.schemaVersion,
    bodyJson: JSON.stringify(input.body),
    updatedAt: input.updatedAt,
  };
}

/**
 * Unwrap a stored document, or `null` when it cannot be trusted.
 *
 * Two rejections, both returning `null` rather than throwing, because a
 * single unreadable row must not take down a read of the rest:
 *
 * - **Unknown major.** A body written by a newer build can hold fields this
 *   one would silently drop on the next write, so it is not read at all.
 * - **Unparseable JSON.** A truncated body is not a document.
 */
export function fromDurableDocumentRow<T>(
  row: SqliteDurableDocumentRow,
  expectedSchemaVersion: number,
): T | null {
  if (row.schemaVersion !== expectedSchemaVersion) return null;
  try {
    return JSON.parse(row.bodyJson) as T;
  } catch {
    return null;
  }
}

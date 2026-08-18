/**
 * Builds the desktop document mirror, and holds the one instance in use.
 *
 * Browser mode gets `null` and no wrapper: there is no SQLite there, so a
 * mirror would be a queue that fails on every write. That is also why this
 * lives apart from `DocumentMirror` itself, which is pure and runtime-blind so
 * it can be tested without Tauri.
 *
 * The instance is kept module-level so its health is readable. A counter with
 * no reader is the exact mistake this program is unwinding: `fellBack` was
 * returned honestly by every kernel call and inspected by nobody until R0.
 */
import { isTauriRuntime, tauriCommands } from "../desktop";
import { DocumentMirror, type MirrorHealth } from "./documentMirror";

let active: DocumentMirror | null = null;

export function createDesktopDocumentMirror(): DocumentMirror | null {
  if (!isTauriRuntime()) return null;
  active = new DocumentMirror({
    saveDocuments: (documents) => tauriCommands.saveDurableDocumentRows(documents),
    deleteDocument: (kind, ownerId) => tauriCommands.deleteDurableDocumentRow(kind, ownerId),
  });
  return active;
}

/**
 * How far the SQLite copy is from localStorage on this device, or `null` in
 * browser mode where the question does not apply.
 *
 * `failed > 0` means SQLite is missing a write localStorage has, which is the
 * condition R6 must refuse to flip reads under.
 */
export function getDocumentMirrorHealth(): MirrorHealth | null {
  return active?.getHealth() ?? null;
}

/** Test seam: forget the instance so a case can build its own. */
export function resetDesktopDocumentMirror(): void {
  active = null;
}

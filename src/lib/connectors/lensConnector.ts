/**
 * Lens connector types and Tauri command wrappers.
 *
 * Mori Lens writes individual JSON files to `~/.mori/connectors/lens/`.
 * Each file is one learning-item transfer, not an agent session event.
 * The wire contract is defined in ADR-0018 of the mori-lens repository.
 *
 * The Rust side (`connectors::lens`) parses, lists, and imports these
 * files. The TypeScript types below describe the same shapes so the UI
 * can display pending transfers and confirm imports.
 */

import { invokeTauriCommand } from "../desktop/tauriCommands";
import type {
  LensImportResult,
  LensInboxListing,
  LensTransferPayload,
} from "../desktop/tauriCommands";
import type { NormalizedImportCandidate } from "../import/types";
import { createImportId } from "../import/id";

export type {
  LensTransferPayload,
  LensPendingTransfer,
  LensInboxListing,
  LensImportResult,
} from "../desktop/tauriCommands";

/** Schema versions this Mori build accepts. Must stay in sync with
 *  the Rust `SUPPORTED_SCHEMA_VERSIONS` constant. */
export const LENS_SUPPORTED_SCHEMA_VERSIONS = [1] as const;

// ─── Tauri command wrappers ─────────────────────────────────────────────

/** Write (or refresh) the capability marker. Fire-and-forget on startup. */
export async function writeLensCapability(): Promise<string> {
  return invokeTauriCommand("write_lens_capability", undefined);
}

/** List pending Lens transfer files with parsed payloads. */
export async function listLensTransfers(): Promise<LensInboxListing> {
  return invokeTauriCommand("list_lens_transfers", undefined);
}

/** Read and parse a single transfer by file name (not full path). */
export async function readLensTransfer(fileName: string): Promise<LensTransferPayload> {
  return invokeTauriCommand("read_lens_transfer", { file_name: fileName });
}

/** Import a transfer as a knowledge record. Idempotent. */
export async function importLensTransfer(fileName: string): Promise<LensImportResult> {
  return invokeTauriCommand("import_lens_transfer", { file_name: fileName });
}

// ─── Normalizer ─────────────────────────────────────────────────────────

/**
 * Convert a Lens transfer payload into a NormalizedImportCandidate.
 *
 * This routes the transfer through the existing Import Review pipeline:
 * the review UI shows the event, and on apply, the sessionStore detects
 * origin "lens-transfer" and calls `importLensTransfer` for persistence.
 *
 * The file name is stored in `source.uri` so the apply path can retrieve it.
 */
export function normalizeLensTransfer(
  payload: LensTransferPayload,
  fileName: string,
  sessionId: string,
  projectId: string,
): NormalizedImportCandidate {
  const capturedAt = payload.createdAt || new Date().toISOString();
  const sourceId = createImportId("src-lens", payload.transferId, capturedAt);
  const eventId = createImportId("evt-lens", payload.transferId, capturedAt);

  const title = payload.kind === "translation"
    ? `Translation: ${truncate(payload.answer, 80)}`
    : `Analysis: ${truncate(payload.answer, 80)}`;

  const summary = payload.original;

  return {
    source: {
      id: sourceId,
      sessionId,
      kind: "lensTransfer",
      title: `Lens transfer ${payload.transferId.slice(0, 8)}`,
      detail: `${payload.kind} · ${payload.sourceLanguage || "?"} → ${payload.targetLanguage || "?"}`,
      uri: fileName, // carry file name through to the apply path
      trustLevel: "verified",
      redactionStatus: "notNeeded",
      rawRetention: "retained",
      capturedAt,
      relatedEventIds: [eventId],
      captureFidelity: { level: "full", reasons: [] },
    },
    events: [
      {
        id: eventId,
        sessionId,
        projectId,
        start: capturedAt,
        type: "documentNote",
        title,
        summary,
        sourceRefs: [sourceId],
        linkedIssueIds: [],
        linkedDecisionIds: [],
        relationshipIds: [],
        trustLevel: "verified",
        confidence: 0.98,
        createdBy: "import",
        userModified: false,
        connectorEventId: `lens::unscoped::${payload.transferId}`,
      },
    ],
  };
}

function truncate(text: string, maxChars: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return chars.slice(0, maxChars).join("") + "...";
}

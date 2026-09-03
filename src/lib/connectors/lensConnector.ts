/**
 * Lens connector types.
 *
 * Mori Lens writes individual JSON files to `~/.mori/connectors/lens/`.
 * Each file is one learning-item transfer, not an agent session event.
 * The wire contract is defined in ADR-0018 of the mori-lens repository.
 *
 * The Rust side (`connectors::lens`) parses, lists, and imports these
 * files. The TypeScript types below describe the same shapes so the UI
 * can display pending transfers and confirm imports.
 */

/**
 * What crosses the boundary from Lens to Mori. One file per item.
 * Mirrors the mori-lens `TransferPayload` struct.
 */
export type LensTransferPayload = {
  schemaVersion: number;
  transferId: string;
  original: string;
  answer: string;
  kind: string;
  sourceLanguage: string;
  targetLanguage: string;
  note: string;
  tags: string[];
  createdAt: string;
};

/** One pending transfer in the inbox listing. */
export type LensPendingTransfer = {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  payload: LensTransferPayload;
  alreadyImported: boolean;
};

/** Result of the `list_lens_transfers` Tauri command. */
export type LensInboxListing = {
  directory: string;
  directoryExists: boolean;
  pending: LensPendingTransfer[];
};

/** Result of the `import_lens_transfer` Tauri command. */
export type LensImportResult = {
  recordId: string;
  transferId: string;
};

/** Schema versions this Mori build accepts. Must stay in sync with
 *  the Rust `SUPPORTED_SCHEMA_VERSIONS` constant. */
export const LENS_SUPPORTED_SCHEMA_VERSIONS = [1] as const;

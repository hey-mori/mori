/**
 * TypeScript adapter for the Mori connector inbox Tauri commands.
 *
 * The Rust commands live in `src-tauri/src/connectors/inbox.rs`:
 *
 *   - `list_connector_jsonl_inbox()` — returns metadata for every JSONL file
 *     under `~/.mori/connectors/`, never recursing into arbitrary user
 *     directories.
 *   - `read_connector_jsonl_file({ input: { path } })` — returns the file's
 *     text + size + modifiedAt, only when `path` resolves underneath the
 *     inbox root after canonicalisation.
 *
 * This module gives the UI a small, typed surface for those commands and
 * an `isConnectorInboxAvailable()` helper that returns `false` in browser
 * mode without throwing. The browser fallback intentionally keeps paste-based
 * JSONL import fully working; the inbox feature is purely a desktop
 * convenience layer.
 */
import { isTauriRuntime } from "./environment";
import {
  invokeTauriCommand,
  type ConnectorInboxFile,
  type ConnectorInboxListing,
  type ConnectorJsonlFile,
} from "./tauriCommands";

export type { ConnectorInboxFile, ConnectorInboxListing, ConnectorJsonlFile };

/**
 * Sentinel error thrown by the adapter when the Tauri bridge is not present.
 * Components catch this and render the browser-mode help row instead of a
 * generic failure toast.
 */
export class ConnectorInboxUnavailableError extends Error {
  readonly reason: "browser-runtime";
  constructor() {
    super(
      "Connector inbox file reading requires the Mori desktop app (Tauri). The browser prototype only supports pasted JSONL.",
    );
    this.name = "ConnectorInboxUnavailableError";
    this.reason = "browser-runtime";
  }
}

/**
 * Cheap synchronous check that components can call before rendering the
 * Refresh button. Mirrors `isTauriRuntime()` but lives in this module so the
 * call site reads as a connector-inbox check rather than a generic Tauri
 * check.
 */
export function isConnectorInboxAvailable(): boolean {
  return isTauriRuntime();
}

/**
 * List every `.jsonl` (and a few sibling extensions) under the Mori
 * connector inbox. Returns `rootExists: false` when the user has not yet
 * created `~/.mori/connectors/`; in that case the UI should render the
 * setup-help empty state instead of an error.
 */
export async function listConnectorJsonlInbox(): Promise<ConnectorInboxListing> {
  if (!isConnectorInboxAvailable()) {
    throw new ConnectorInboxUnavailableError();
  }
  return invokeTauriCommand("list_connector_jsonl_inbox", undefined);
}

/**
 * Read one JSONL file from the inbox. The path must already live under the
 * inbox root — the Rust side rejects anything outside.
 */
export async function readConnectorJsonlFile(path: string): Promise<ConnectorJsonlFile> {
  // Input validation runs first so a bad call site fails the same way in
  // every runtime; the desktop-availability check is the runtime gate.
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error("Connector inbox path is required.");
  }
  if (!isConnectorInboxAvailable()) {
    throw new ConnectorInboxUnavailableError();
  }
  return invokeTauriCommand("read_connector_jsonl_file", { input: { path: trimmed } });
}

// ─── Pure formatting helpers (tested independently) ────────────────────────

/**
 * Format a file size in a compact, locale-stable way (KB/MB only; the inbox
 * cap is 8 MB so we never need GB).
 */
export function formatInboxFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
}

/**
 * "12 minutes ago" / "yesterday" / "May 14" style label for the inbox file
 * list. The Rust side emits an ISO-ish timestamp; we convert it locally so
 * the UI doesn't need to depend on a date library.
 */
export function formatInboxModifiedAt(
  iso: string,
  now: number = Date.now(),
): string {
  const parsed = new Date(iso).getTime();
  if (!Number.isFinite(parsed)) return iso;
  const diffMs = now - parsed;
  if (diffMs < 0) return new Date(parsed).toLocaleString();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(parsed).toLocaleDateString();
}

/**
 * Friendly label for a connector family id. The Rust side never invents new
 * families — it uses one of the five canonical names — but we centralise the
 * display copy here so feature surfaces don't redefine it.
 */
export function formatConnectorFamily(family: string): string {
  switch (family) {
    case "claude-code":
      return "Claude Code";
    case "codex-cli":
      return "Codex CLI";
    case "terminal":
      return "Terminal";
    case "git":
      return "Git";
    case "other":
      return "Other";
    default:
      return family;
  }
}

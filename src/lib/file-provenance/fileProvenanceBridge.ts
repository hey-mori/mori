/**
 * Desktop bridge for file provenance.
 *
 * Thin wrappers around the Tauri commands that make recorded file touches
 * actionable: resolving each recorded path against the current filesystem
 * (present / moved / missing) and revealing a file in the OS file manager.
 *
 * Both no-op gracefully in the browser prototype: location resolution returns
 * an empty list (so every file reads as `unknown`, never falsely "present"),
 * and reveal does nothing. Callers never need to branch on the runtime.
 */

import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";
import type { ResolvedFileLocation } from "./fileProvenance";

export function isFileProvenanceBridgeAvailable(): boolean {
  return isTauriRuntime();
}

/**
 * Resolve recorded paths against the filesystem. `searchRoot` (the session's
 * project root) enables move detection by basename. Returns `[]` in the
 * browser or when there is nothing to resolve.
 */
export async function resolveFileLocations(
  paths: readonly string[],
  searchRoot?: string,
): Promise<ResolvedFileLocation[]> {
  if (!isTauriRuntime() || paths.length === 0) {
    return [];
  }
  return invokeTauriCommand("resolve_file_locations", {
    paths: [...paths],
    ...(searchRoot ? { searchRoot } : {}),
  });
}

/** Reveal a file in the OS file manager. No-op in the browser. */
export async function revealPathInOs(path: string): Promise<void> {
  if (!isTauriRuntime() || !path.trim()) {
    return;
  }
  await invokeTauriCommand("reveal_path_in_os", { path });
}

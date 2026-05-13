import { invokeTauriCommand } from "./tauriCommands";

export type PickRepositoryRequest = {
  initialDirectory?: string;
  title?: string;
};

export type PickRepositoryResult = {
  path: string | null;
  cancelled: boolean;
};

/**
 * Open the native directory picker (Tauri) and return the chosen path. Mori
 * never opens this dialog automatically — every call is driven by an explicit
 * user click. In browser mode the underlying invoke helper throws the same
 * "requires the Tauri app" error other desktop commands use.
 */
export async function pickRepositoryDirectory(
  request: PickRepositoryRequest = {},
): Promise<PickRepositoryResult> {
  const payload: { initialDirectory?: string; title?: string } = {};
  if (typeof request.initialDirectory === "string" && request.initialDirectory.trim()) {
    payload.initialDirectory = request.initialDirectory.trim();
  }
  if (typeof request.title === "string" && request.title.trim()) {
    payload.title = request.title.trim();
  }
  return invokeTauriCommand("pick_repository_directory", { input: payload });
}

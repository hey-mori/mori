import { invokeTauriCommand } from "./tauriCommands";

export type PickRepositoryRequest = {
  initialDirectory?: string;
  title?: string;
};

export type PickRepositoryResult = {
  path: string | null;
  cancelled: boolean;
};

export type VerifyRepositoryRequest = {
  repoPath: string;
};

export type RepositoryVerificationResult = {
  repoPath: string;
  gitRoot: string;
  currentBranch: string | null;
  headCommit: string;
  shortHeadCommit: string;
  isDirty: boolean;
  verifiedAt: string;
  commandDurationMs: number;
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

/**
 * Explicitly verify a repository path through the Tauri Rust command. Only
 * runs when the user clicks Verify — there is no implicit re-check on app
 * start, store hydrate, or Git diff fetch. Browser mode throws the same
 * "requires the Tauri app" error other desktop commands use.
 */
export async function verifyRepositoryPath(
  request: VerifyRepositoryRequest,
): Promise<RepositoryVerificationResult> {
  const trimmed = (request.repoPath ?? "").trim();
  if (!trimmed) {
    return Promise.reject(new Error("Repository path is required."));
  }
  return invokeTauriCommand("verify_repository_path", { request: { repoPath: trimmed } });
}

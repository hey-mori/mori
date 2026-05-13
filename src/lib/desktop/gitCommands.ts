import { invokeTauriCommand } from "./tauriCommands";

export type GitDiffCaptureRequest = {
  repoPath: string;
  range?: string;
  staged?: boolean;
};

export type GitDiffCaptureResult = {
  repoPath: string;
  range: string | null;
  staged: boolean;
  diffText: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  fileCountHint: number;
  truncated: boolean;
};

/**
 * Run `git diff` against an explicitly provided repository path via the Tauri
 * shell. React components must call this through {@link tauriCommands.runGitDiff}
 * rather than invoking Tauri directly. In browser/preview mode the underlying
 * `invokeTauriCommand` throws a clear "requires the Tauri app" error.
 */
export function runGitDiff(request: GitDiffCaptureRequest): Promise<GitDiffCaptureResult> {
  const trimmed = (request.repoPath ?? "").trim();
  if (!trimmed) {
    return Promise.reject(new Error("Repository path is required."));
  }
  const payload: GitDiffCaptureRequest = { repoPath: trimmed };
  const normalizedRange = normalizeRange(request.range);
  if (normalizedRange !== undefined) payload.range = normalizedRange;
  if (typeof request.staged === "boolean") payload.staged = request.staged;
  return invokeTauriCommand("run_git_diff", { request: payload });
}

function normalizeRange(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

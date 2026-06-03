/**
 * Explicit terminal / IDE emitter setup helpers.
 *
 * Mori can stage the terminal helper and VS Code task template into
 * `~/.mori/` with their `mori-local-capture.py` path already rewritten to the
 * staged local-capture bridge. Mori still does not edit shell rc files,
 * project `.vscode/tasks.json`, or any editor config automatically.
 */

import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";

export type ExplicitEmitterStagedFile = {
  label: string;
  path: string;
  wrote: boolean;
};

export type ExplicitEmittersStaged = {
  rootPath: string;
  localCapturePath: string;
  terminalHelperPath: string;
  vscodeTasksPath: string;
  files: ExplicitEmitterStagedFile[];
  wroteCount: number;
};

export class ExplicitEmitterSetupUnavailableError extends Error {
  readonly reason: "browser-runtime";
  constructor() {
    super(
      "Staging explicit terminal / IDE emitters requires the Mori desktop app (Tauri). In the browser, copy connectors/terminal-helper/ and connectors/vscode-task/ manually.",
    );
    this.name = "ExplicitEmitterSetupUnavailableError";
    this.reason = "browser-runtime";
  }
}

export async function stageExplicitEmitters(): Promise<ExplicitEmittersStaged> {
  if (!isTauriRuntime()) {
    throw new ExplicitEmitterSetupUnavailableError();
  }
  return invokeTauriCommand("stage_explicit_emitters", undefined);
}

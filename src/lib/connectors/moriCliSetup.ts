/**
 * Mori CLI setup helpers.
 *
 * Desktop builds can stage the bundled CLI and delegate scripts into
 * `~/.mori/` so users do not need to reference the repo checkout path. Mori
 * never edits shell rc files or creates a PATH symlink automatically.
 */

import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";

export type MoriCliStagedFile = {
  label: string;
  path: string;
  wrote: boolean;
};

export type MoriCliStaged = {
  rootPath: string;
  cliPath: string;
  files: MoriCliStagedFile[];
  wroteCount: number;
};

export class MoriCliSetupUnavailableError extends Error {
  readonly reason: "browser-runtime";
  constructor() {
    super(
      "Staging the Mori CLI requires the Mori desktop app (Tauri). In the browser, use connectors/mori-cli/mori.py manually.",
    );
    this.name = "MoriCliSetupUnavailableError";
    this.reason = "browser-runtime";
  }
}

export async function stageMoriCli(): Promise<MoriCliStaged> {
  if (!isTauriRuntime()) {
    throw new MoriCliSetupUnavailableError();
  }
  return invokeTauriCommand("stage_mori_cli", undefined);
}

export async function getMoriCliTargetPath(): Promise<string> {
  if (!isTauriRuntime()) {
    throw new MoriCliSetupUnavailableError();
  }
  return invokeTauriCommand("mori_cli_target_path", undefined);
}

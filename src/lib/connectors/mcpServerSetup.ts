/**
 * MCP server setup helpers.
 *
 * Mori stages the MCP capture server into `~/.mori/connectors/mcp/` (a local
 * file copy, via the `stage_mcp_server` Tauri command) and the user pastes a
 * generated config snippet into their MCP host. Mori never edits the host's
 * config itself — `buildMcpConfigSnippet` produces the exact snippet to copy.
 *
 * `buildMcpConfigSnippet` is pure (no Tauri / React) so it is unit-tested
 * directly; the bridge functions require the desktop runtime.
 */

import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";

export type McpServerStaged = {
  /** Absolute path to the staged server script. */
  scriptPath: string;
  /** True when the file was (re)written, false when it already matched. */
  wrote: boolean;
};

export type McpConfigSnippetOptions = {
  /** Server key in the host config. */
  serverName?: string;
  /** Interpreter command (some hosts need `python3`). */
  pythonCommand?: string;
};

/**
 * Build the host `mcpServers` config snippet that registers the staged Mori
 * capture server. The user pastes this into their MCP host config (e.g.
 * Claude Desktop's `claude_desktop_config.json`).
 */
export function buildMcpConfigSnippet(
  scriptPath: string,
  options: McpConfigSnippetOptions = {},
): string {
  const serverName = options.serverName?.trim() || "mori-capture";
  const pythonCommand = options.pythonCommand?.trim() || "python";
  const snippet = {
    mcpServers: {
      [serverName]: {
        command: pythonCommand,
        args: [scriptPath],
      },
    },
  };
  return JSON.stringify(snippet, null, 2);
}

export class McpSetupUnavailableError extends Error {
  readonly reason: "browser-runtime";
  constructor() {
    super(
      "Staging the Mori MCP server requires the Mori desktop app (Tauri). In the browser, copy connectors/mcp/ manually.",
    );
    this.name = "McpSetupUnavailableError";
    this.reason = "browser-runtime";
  }
}

/** Stage the embedded MCP server into `~/.mori/connectors/mcp/`. */
export async function stageMcpServer(): Promise<McpServerStaged> {
  if (!isTauriRuntime()) {
    throw new McpSetupUnavailableError();
  }
  return invokeTauriCommand("stage_mcp_server", undefined);
}

/** The absolute path the server would be staged at, without writing it. */
export async function getMcpServerTargetPath(): Promise<string> {
  if (!isTauriRuntime()) {
    throw new McpSetupUnavailableError();
  }
  return invokeTauriCommand("mcp_server_target_path", undefined);
}

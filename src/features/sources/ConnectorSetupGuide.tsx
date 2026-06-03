import { Check, ClipboardCopy } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import {
  buildMcpConfigSnippet,
  stageMoriCli,
  stageMcpServer,
  type ConnectorSetupGuide,
} from "../../lib/connectors";
import { isTauriRuntime } from "../../lib/desktop";

/**
 * Shared in-app connector setup guide.
 *
 * The docs-template capture surfaces (Claude Code hook, Codex / OpenCode CLI
 * wrappers, the local-capture bridge, the MCP server) ship a real pipeline but
 * require the user to install a small script before they emit connector JSONL.
 * `getConnectorSetupGuide` supplies the ordered, copyable steps; this component
 * renders them. It is shared so the live 소스 inspector and the retired
 * `SourceControlCenter` render byte-identical setup copy, with no drift.
 *
 * Every command is explicit and local-only. The MCP affordance stages the
 * server into `~/.mori` and reveals the host-config snippet to paste; Mori
 * never edits the host config itself.
 */
export function ConnectorSetupGuidePanel({ guide }: { guide: ConnectorSetupGuide }) {
  return (
    <div className="source-row-setup">
      <strong className="source-row-setup-title">설정 방법</strong>
      <ol className="source-row-setup-steps">
        {guide.steps.map((step, index) => (
          <li key={index}>
            <span className="source-row-setup-text">{step.text}</span>
            {step.command ? <CopyableCommand command={step.command} /> : null}
          </li>
        ))}
      </ol>
      {hasMoriCliStaging(guide.surfaceId) ? <MoriCliStaging /> : null}
      {guide.surfaceId === "mcpServer" ? <McpServerStaging /> : null}
      <p className="source-row-setup-note">{guide.importNote}</p>
    </div>
  );
}

function hasMoriCliStaging(surfaceId: ConnectorSetupGuide["surfaceId"]): boolean {
  return surfaceId === "codexCliWrapper" || surfaceId === "openCodeCli" || surfaceId === "localCaptureBridge";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function MoriCliStaging() {
  const desktop = isTauriRuntime();
  const [installCommand, setInstallCommand] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      const staged = await stageMoriCli();
      setStatus(`~/.mori에 CLI 파일 ${staged.files.length}개 준비 완료`);
      setInstallCommand(`mkdir -p ~/.local/bin && ln -sf ${shellQuote(staged.cliPath)} ~/.local/bin/mori`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="source-row-mcp-stage">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void prepare()}
        disabled={!desktop || busy}
        title={desktop ? undefined : "데스크톱 앱에서만 Mori CLI를 준비할 수 있습니다."}
      >
        {busy ? "준비 중…" : "Mori CLI 준비"}
      </Button>
      {!desktop ? (
        <span className="source-row-setup-text">
          데스크톱 앱에서 CLI와 위임 스크립트를 ~/.mori에 복사합니다.
        </span>
      ) : null}
      {status ? <span className="source-row-status tone-green">{status}</span> : null}
      {error ? <span className="source-row-status tone-orange">{error}</span> : null}
      {installCommand ? <CopyableCommand command={installCommand} /> : null}
    </div>
  );
}

/**
 * MCP-only affordance: stage the server into ~/.mori and reveal the exact host
 * config snippet to paste. Mori never edits the host config itself. Desktop
 * only, in the browser the action is disabled with an honest hint.
 */
function McpServerStaging() {
  const desktop = isTauriRuntime();
  const [snippet, setSnippet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      const staged = await stageMcpServer();
      setSnippet(buildMcpConfigSnippet(staged.scriptPath));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="source-row-mcp-stage">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void prepare()}
        disabled={!desktop || busy}
        title={desktop ? undefined : "데스크톱 앱에서만 서버를 준비할 수 있습니다."}
      >
        {busy ? "준비 중…" : "MCP 서버 준비"}
      </Button>
      {!desktop ? (
        <span className="source-row-setup-text">
          데스크톱 앱에서 서버를 ~/.mori에 복사하고 붙여넣을 설정 스니펫을 만들어 줍니다.
        </span>
      ) : null}
      {error ? <span className="source-row-status tone-orange">{error}</span> : null}
      {snippet ? <CopyableCommand command={snippet} /> : null}
    </div>
  );
}

export function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard
      .writeText(command)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }
  return (
    <div className="source-row-command">
      <code>{command}</code>
      <button
        type="button"
        className="source-row-command-copy"
        onClick={copy}
        aria-label={copied ? "복사됨" : "명령 복사"}
        title={copied ? "복사됨" : "명령 복사"}
      >
        {copied ? (
          <Check size={13} aria-hidden="true" />
        ) : (
          <ClipboardCopy size={13} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

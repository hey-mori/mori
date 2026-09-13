import { describe, expect, it } from "vitest";
import type { ConnectorEvent } from "../../../connectors/types";
import {
  isTerminalConnectorEvent,
  terminalConnectorEventToTraceEvent,
  terminalConnectorEventToTraceSpan,
} from "./terminalTrace";

function event(overrides: Partial<ConnectorEvent> = {}): ConnectorEvent {
  return {
    id: overrides.id ?? "cmd-1",
    connectorId: overrides.connectorId ?? "terminalShell",
    kind: overrides.kind ?? "command_finished",
    occurredAt: overrides.occurredAt ?? "2026-09-09T01:00:00.000Z",
    receivedAt: overrides.receivedAt,
    projectPath: overrides.projectPath ?? "C:/dev/mori",
    sessionId: overrides.sessionId ?? "shell-1",
    sourceTitle: overrides.sourceTitle,
    summary: overrides.summary ?? "npm test passed",
    rawText: overrides.rawText,
    command: overrides.command ?? "npm test",
    filePath: overrides.filePath,
    git: overrides.git,
    tool: overrides.tool ?? { name: "powershell", exitCode: 0, durationMs: 5000 },
    privacy: overrides.privacy ?? {
      captureMethod: "local_desktop_command",
      rawDataPolicy: "summary_only",
    },
    provenance: overrides.provenance ?? { toolName: "mori-terminal-capture", toolVersion: "0.1.0" },
  };
}

describe("terminal trace projection", () => {
  it("projects existing terminal connector command evidence into source-neutral trace fields", () => {
    const traceEvent = terminalConnectorEventToTraceEvent(event());
    expect(traceEvent).not.toBeNull();
    expect(traceEvent?.source.kind).toBe("terminal");
    expect(traceEvent?.kind).toBe("terminal.command_finished");
    expect(traceEvent?.occurredAt).toBe("2026-09-09T01:00:00.000Z");
    expect(traceEvent?.metadata).toMatchObject({
      connectorId: "terminalShell",
      externalSessionId: "shell-1",
      projectPath: "C:/dev/mori",
      command: "npm test",
      exitCode: 0,
      durationMs: 5000,
    });
    expect(traceEvent).not.toHaveProperty("url");
    expect(traceEvent).not.toHaveProperty("tabId");
    expect(traceEvent).not.toHaveProperty("browserProfile");
    expect(traceEvent).not.toHaveProperty("agentId");
  });

  it("does not treat AI wrapper command events as terminal source events", () => {
    const codexCommand = event({
      connectorId: "codexCliWrapper",
      kind: "command_finished",
      sessionId: "codex-1",
    });
    expect(isTerminalConnectorEvent(codexCommand)).toBe(false);
    expect(terminalConnectorEventToTraceEvent(codexCommand)).toBeNull();
  });

  it("builds a command span only from an observed duration", () => {
    const span = terminalConnectorEventToTraceSpan(event());
    expect(span).not.toBeNull();
    expect(span?.kind).toBe("terminal.command");
    expect(span?.start).toBe("2026-09-09T00:59:55.000Z");
    expect(span?.end).toBe("2026-09-09T01:00:00.000Z");
    expect(span?.title).toBe("npm test");
  });

  it("keeps duration-less command events as point evidence, not spans", () => {
    const traceEvent = event({ tool: { name: "powershell", exitCode: 0 } });
    expect(terminalConnectorEventToTraceEvent(traceEvent)).not.toBeNull();
    expect(terminalConnectorEventToTraceSpan(traceEvent)).toBeNull();
  });
});

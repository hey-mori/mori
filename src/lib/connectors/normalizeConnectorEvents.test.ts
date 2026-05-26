import { describe, expect, it } from "vitest";
import {
  ingestConnectorEventBatch,
  ingestConnectorJsonl,
  normalizeConnectorEventBatch,
  parseConnectorJsonl,
  type ConnectorEvent,
} from "./index";
import { CONNECTOR_FIDELITY_REASON } from "./normalizeConnectorEvents";

function event(overrides: Partial<ConnectorEvent>): ConnectorEvent {
  return {
    id: overrides.id ?? "evt-1",
    connectorId: overrides.connectorId ?? "claudeCodeHook",
    kind: overrides.kind ?? "prompt_submitted",
    occurredAt: overrides.occurredAt ?? "2026-05-14T10:00:00Z",
    summary: overrides.summary ?? "Refactor the timeline collision layout.",
    sessionId: overrides.sessionId ?? "claude-session-abc",
    sourceTitle: overrides.sourceTitle,
    rawText: overrides.rawText,
    command: overrides.command,
    filePath: overrides.filePath,
    git: overrides.git,
    tool: overrides.tool,
    privacy: overrides.privacy ?? {
      captureMethod: "local_hook",
      rawDataPolicy: "summary_only",
    },
    provenance: overrides.provenance ?? { toolName: "mori-claude-hook.sh", toolVersion: "0.1.0" },
  };
}

describe("normalizeConnectorEventBatch", () => {
  it("buckets events by (connectorId, sessionId) into separate sources", () => {
    const events = [
      event({ id: "a", connectorId: "claudeCodeHook", sessionId: "alpha" }),
      event({ id: "b", connectorId: "claudeCodeHook", sessionId: "alpha", kind: "assistant_message" }),
      event({ id: "c", connectorId: "claudeCodeHook", sessionId: "beta", kind: "prompt_submitted" }),
      event({ id: "d", connectorId: "codexCliWrapper", sessionId: "gamma", kind: "command_finished", command: "npm test" }),
    ];
    const candidates = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events,
      applyRedaction: false,
    });
    expect(candidates).toHaveLength(3);
    const kinds = new Set(candidates.map((candidate) => candidate.source.kind));
    expect(kinds.has("claudeTranscript")).toBe(true);
    expect(kinds.has("codexTranscript")).toBe(true);
  });

  it("uses the earliest occurredAt as the source capturedAt", () => {
    const events = [
      event({ id: "later", occurredAt: "2026-05-14T11:00:00Z" }),
      event({ id: "earlier", occurredAt: "2026-05-14T09:30:00Z" }),
    ];
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events,
      applyRedaction: false,
    });
    expect(candidate.source.capturedAt).toBe("2026-05-14T09:30:00Z");
  });

  it("emits a TimelineEvent for each non-session-started event", () => {
    const events = [
      event({ id: "start", kind: "session_started", summary: "Mori claude session start" }),
      event({ id: "p1", kind: "prompt_submitted" }),
      event({ id: "a1", kind: "assistant_message" }),
      event({ id: "end", kind: "session_finished" }),
    ];
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events,
      applyRedaction: false,
    });
    expect(candidate.events.map((event) => event.title)).toHaveLength(3);
    // The session source title falls back to the session_started summary.
    expect(candidate.source.title).toMatch(/claude session/i);
  });

  it("maps connector kinds to the right event types", () => {
    const events = [
      event({ id: "p", kind: "prompt_submitted" }),
      event({ id: "f", kind: "file_changed", filePath: "src/foo.ts" }),
      event({
        id: "c",
        kind: "command_finished",
        command: "npm run typecheck",
        connectorId: "codexCliWrapper",
        sessionId: "gamma",
      }),
      event({
        id: "g",
        kind: "git_diff_captured",
        connectorId: "git",
        sessionId: "delta",
        git: { repoPath: "/x", additions: 4, deletions: 1, files: [{ path: "src/foo.ts" }] },
      }),
    ];
    const candidates = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events,
      applyRedaction: false,
    });
    const typesByEventId = new Map<string, string>();
    for (const candidate of candidates) {
      for (const evt of candidate.events) typesByEventId.set(evt.id.split("-").pop() ?? "", evt.type);
    }
    expect([...new Set(candidates.flatMap((c) => c.events.map((e) => e.type)))]).toEqual(
      expect.arrayContaining(["aiConversation", "fileCode"]),
    );
  });

  it("preserves source provenance via sourceRefs", () => {
    const events = [event({ id: "a" }), event({ id: "b", kind: "assistant_message" })];
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events,
      applyRedaction: false,
    });
    for (const evt of candidate.events) {
      expect(evt.sourceRefs).toEqual([candidate.source.id]);
    }
    expect(candidate.source.relatedEventIds).toEqual(candidate.events.map((evt) => evt.id));
  });

  it("uses verified trust + retained policy for manual_paste batches", () => {
    const events = [
      event({
        id: "manual-1",
        connectorId: "manual",
        kind: "prompt_submitted",
        privacy: { captureMethod: "manual_paste", rawDataPolicy: "retained" },
      }),
    ];
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events,
      applyRedaction: false,
    });
    expect(candidate.source.trustLevel).toBe("verified");
    expect(candidate.source.rawRetention).toBe("retained");
  });

  it("uses observed trust for hook-captured commands", () => {
    const events = [
      event({
        id: "cmd-1",
        connectorId: "codexCliWrapper",
        kind: "command_finished",
        command: "npm test",
        privacy: { captureMethod: "local_cli_wrapper", rawDataPolicy: "summary_only" },
      }),
    ];
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events,
      applyRedaction: false,
    });
    expect(candidate.source.trustLevel).toBe("observed");
    expect(candidate.source.rawRetention).toBe("summaryOnly");
  });
});

describe("connector bucket capture fidelity", () => {
  it("marks a session bracketed by start + finish as full", () => {
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events: [
        event({ id: "s", kind: "session_started" }),
        event({ id: "p", kind: "prompt_submitted" }),
        event({ id: "e", kind: "session_finished" }),
      ],
      applyRedaction: false,
    });
    expect(candidate.source.captureFidelity?.level).toBe("full");
    expect(candidate.source.captureFidelity?.reasons).toEqual([]);
  });

  it("marks a mid-session slice (no start, no finish) as partial with both reasons", () => {
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events: [event({ id: "p", kind: "prompt_submitted" })],
      applyRedaction: false,
    });
    expect(candidate.source.captureFidelity?.level).toBe("partial");
    expect(candidate.source.captureFidelity?.reasons).toContain(CONNECTOR_FIDELITY_REASON.noSessionStart);
    expect(candidate.source.captureFidelity?.reasons).toContain(CONNECTOR_FIDELITY_REASON.noSessionEnd);
  });

  it("flags a session that started but was not finished", () => {
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events: [
        event({ id: "s", kind: "session_started" }),
        event({ id: "p", kind: "prompt_submitted" }),
      ],
      applyRedaction: false,
    });
    expect(candidate.source.captureFidelity?.level).toBe("partial");
    expect(candidate.source.captureFidelity?.reasons).toEqual([CONNECTOR_FIDELITY_REASON.noSessionEnd]);
  });

  it("treats a single-artifact bucket (lone git diff) as full", () => {
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events: [
        event({
          id: "g",
          connectorId: "git",
          sessionId: "delta",
          kind: "git_diff_captured",
          git: { repoPath: "/x", additions: 4, deletions: 1, files: [{ path: "src/foo.ts" }] },
        }),
      ],
      applyRedaction: false,
    });
    expect(candidate.source.captureFidelity?.level).toBe("full");
  });
});

describe("ingestConnectorJsonl (facade)", () => {
  it("parses + validates + normalizes a real JSONL stream end to end", () => {
    const jsonl = [
      JSON.stringify(
        event({ id: "evt-1", kind: "session_started", summary: "Claude Code session: refactor timeline" }),
      ),
      JSON.stringify(
        event({
          id: "evt-2",
          kind: "prompt_submitted",
          summary: "How do I make the kanban responsive?",
        }),
      ),
      JSON.stringify(
        event({
          id: "evt-3",
          kind: "command_finished",
          command: "npm run typecheck",
          summary: "typecheck passed",
        }),
      ),
    ].join("\n");

    const result = ingestConnectorJsonl({
      text: jsonl,
      projectId: "proj-1",
      sessionId: "active",
      applyRedaction: false,
    });
    expect(result.outcome.errors).toEqual([]);
    expect(result.outcome.events).toHaveLength(3);
    expect(result.candidates).toHaveLength(1); // single bucket
    expect(result.candidates[0].events).toHaveLength(2); // session_started is dropped
  });

  it("redacts obvious secrets from summary and command fields", () => {
    const jsonl = JSON.stringify(
      event({
        id: "evt-secret",
        kind: "command_finished",
        command: "curl -H 'Authorization: Bearer abcdef1234567890abcdef' https://api.example.com",
        summary: "Calling API with OPENAI_API_KEY=sk-proj-1234567890abcdefghij",
      }),
    );
    const result = ingestConnectorJsonl({
      text: jsonl,
      projectId: "proj-1",
      sessionId: "active",
      applyRedaction: true,
    });
    expect(result.outcome.events).toHaveLength(1);
    const event0 = result.outcome.events[0];
    expect(event0.summary).toContain("[REDACTED");
    expect(event0.command).toContain("[REDACTED");
    expect(event0.privacy.redacted).toBe(true);
    // The normalized TimelineEvent should also carry the redacted summary.
    expect(result.candidates[0].events[0].summary).toContain("[REDACTED");
  });

  it("never throws on malformed lines; errors come back in outcome.errors", () => {
    const jsonl = "{not json\n" + JSON.stringify(event({ id: "ok" }));
    const result = ingestConnectorJsonl({
      text: jsonl,
      projectId: "proj-1",
      sessionId: "active",
    });
    expect(result.outcome.errors[0].line).toBe(1);
    expect(result.outcome.events).toHaveLength(1);
    expect(result.candidates).toHaveLength(1);
  });

  it("returns no candidates when every line fails", () => {
    const jsonl = "{}\n{}";
    const result = ingestConnectorJsonl({ text: jsonl, projectId: "p", sessionId: "s" });
    expect(result.outcome.events).toEqual([]);
    expect(result.candidates).toEqual([]);
    expect(result.outcome.errors.length).toBeGreaterThan(0);
  });
});

describe("ingestConnectorEventBatch", () => {
  it("validates and normalizes an in-memory array (Tauri ingest shape)", () => {
    const result = ingestConnectorEventBatch({
      events: [event({ id: "evt-1" }), { totally: "broken" }],
      projectId: "proj-1",
      sessionId: "active",
      applyRedaction: false,
    });
    expect(result.outcome.events).toHaveLength(1);
    expect(result.outcome.errors[0].index).toBe(1);
    expect(result.candidates).toHaveLength(1);
  });
});

describe("New connector ids + transcript_imported kind", () => {
  it("desktopTranscriptImport maps to the aiConversation source kind", () => {
    const events = [
      event({
        id: "import-1",
        connectorId: "desktopTranscriptImport",
        sessionId: "claude-desktop-export-001",
        kind: "transcript_imported",
        summary: "Pasted Claude Desktop transcript: refactor Timeline",
        privacy: { captureMethod: "manual_paste", rawDataPolicy: "summary_only" },
      }),
    ];
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events,
      applyRedaction: false,
    });
    expect(candidate.source.kind).toBe("aiConversation");
    expect(candidate.events).toHaveLength(1);
    expect(candidate.events[0].type).toBe("aiConversation");
    expect(candidate.source.trustLevel).toBe("verified");
  });

  it("githubPrImport maps to the gitDiff source kind for now (Planned)", () => {
    const events = [
      event({
        id: "pr-1",
        connectorId: "githubPrImport",
        sessionId: "pr-1234",
        kind: "transcript_imported",
        summary: "Pasted GitHub PR #1234 description + comments",
        privacy: { captureMethod: "manual_paste", rawDataPolicy: "summary_only" },
      }),
    ];
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events,
      applyRedaction: false,
    });
    expect(candidate.source.kind).toBe("gitDiff");
    expect(candidate.events).toHaveLength(1);
  });

  it("terminalShell + gitCommand reuse terminal + gitDiff source kinds", () => {
    const events = [
      event({
        id: "ts-1",
        connectorId: "terminalShell",
        sessionId: "shell-zsh-001",
        kind: "command_finished",
        command: "pnpm test",
        summary: "pnpm test · exit 0",
      }),
      event({
        id: "gc-1",
        connectorId: "gitCommand",
        sessionId: "git-001",
        kind: "git_diff_captured",
        summary: "git diff --shortstat",
        git: { repoPath: "/x", additions: 2, deletions: 0, files: [{ path: "src/x.ts" }] },
      }),
    ];
    const candidates = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events,
      applyRedaction: false,
    });
    const kinds = new Set(candidates.map((c) => c.source.kind));
    expect(kinds.has("terminal")).toBe(true);
    expect(kinds.has("gitDiff")).toBe(true);
  });

  it("transcript_imported on an unknown connectorId falls back to aiConversation", () => {
    const events = [
      event({
        id: "custom-1",
        connectorId: "some-future-connector",
        kind: "transcript_imported",
        summary: "Imported via future connector",
        privacy: { captureMethod: "manual_paste", rawDataPolicy: "summary_only" },
      }),
    ];
    const [candidate] = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events,
      applyRedaction: false,
    });
    expect(candidate.source.kind).toBe("aiConversation");
  });
});

describe("Sample Claude Code + Codex CLI events", () => {
  it("normalises a realistic Claude Code hook batch", () => {
    const jsonl = [
      JSON.stringify(
        event({
          id: "claude-1",
          connectorId: "claudeCodeHook",
          kind: "session_started",
          sessionId: "claude-2026-05-14",
          summary: "Mori timeline refactor",
        }),
      ),
      JSON.stringify(
        event({
          id: "claude-2",
          connectorId: "claudeCodeHook",
          sessionId: "claude-2026-05-14",
          kind: "prompt_submitted",
          summary: "Make the kanban responsive at <=1180",
        }),
      ),
      JSON.stringify(
        event({
          id: "claude-3",
          connectorId: "claudeCodeHook",
          sessionId: "claude-2026-05-14",
          kind: "tool_finished",
          tool: { name: "Edit", exitCode: 0, durationMs: 320 },
          summary: "Edited src/styles.css",
        }),
      ),
    ].join("\n");
    const outcome = parseConnectorJsonl(jsonl);
    expect(outcome.errors).toEqual([]);
    const candidates = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events: outcome.events,
      applyRedaction: false,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source.kind).toBe("claudeTranscript");
    expect(candidates[0].source.title).toMatch(/Mori timeline refactor/);
  });

  it("normalises a realistic Codex CLI wrapper batch", () => {
    const jsonl = [
      JSON.stringify(
        event({
          id: "codex-1",
          connectorId: "codexCliWrapper",
          sessionId: "codex-task-001",
          kind: "session_started",
          summary: "Run repo dependency upgrade",
        }),
      ),
      JSON.stringify(
        event({
          id: "codex-2",
          connectorId: "codexCliWrapper",
          sessionId: "codex-task-001",
          kind: "command_finished",
          command: "npm outdated",
          summary: "npm outdated · 12 packages",
        }),
      ),
      JSON.stringify(
        event({
          id: "codex-3",
          connectorId: "codexCliWrapper",
          sessionId: "codex-task-001",
          kind: "git_diff_captured",
          summary: "Captured 3 file diff",
          git: { repoPath: "/repo", additions: 28, deletions: 6, files: [{ path: "package.json" }] },
        }),
      ),
    ].join("\n");
    const outcome = parseConnectorJsonl(jsonl);
    expect(outcome.errors).toEqual([]);
    const candidates = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events: outcome.events,
      applyRedaction: false,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source.kind).toBe("codexTranscript");
    expect(candidates[0].events.length).toBe(2);
  });
});

describe("Connector event identity preservation", () => {
  it("stamps connectorEventId onto every produced TimelineEvent", () => {
    const candidates = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "active",
      events: [
        {
          id: "claude-001",
          connectorId: "claudeCodeHook",
          kind: "prompt_submitted",
          occurredAt: "2026-05-14T10:00:00Z",
          sessionId: "claude-2026-05-14",
          summary: "Test prompt",
          privacy: { captureMethod: "local_hook", rawDataPolicy: "summary_only" },
          provenance: { toolName: "mori-claude-hook.sh" },
        },
        {
          id: "claude-002",
          connectorId: "claudeCodeHook",
          kind: "tool_finished",
          occurredAt: "2026-05-14T10:01:00Z",
          sessionId: "claude-2026-05-14",
          summary: "Edited src/foo.ts",
          tool: { name: "Edit" },
          privacy: { captureMethod: "local_hook", rawDataPolicy: "summary_only" },
          provenance: { toolName: "mori-claude-hook.sh" },
        },
      ],
    });
    expect(candidates).toHaveLength(1);
    const identities = candidates[0].events.map((event) => event.connectorEventId);
    expect(identities).toEqual([
      "claudeCodeHook::claude-2026-05-14::claude-001",
      "claudeCodeHook::claude-2026-05-14::claude-002",
    ]);
  });
});

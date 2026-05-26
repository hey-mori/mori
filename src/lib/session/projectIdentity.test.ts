import { describe, expect, it } from "vitest";
import type { Session, SourceRef } from "../../domain/types";
import { deriveProjectIdentityHint } from "./projectIdentity";

const session: Session = {
  id: "s1",
  projectId: "fallback-project",
  title: "Work unit",
  startedAt: "2026-05-22T09:00:00Z",
  endedAt: "2026-05-22T10:00:00Z",
  recordingMode: "summary",
  llmProvider: "ollama",
  llmModel: "llama",
  storageLocation: "browser",
  selectedSourceIds: [],
  status: "complete",
};

function source(overrides: Partial<SourceRef>): SourceRef {
  return {
    id: "src-1",
    sessionId: "s1",
    kind: "gitDiff",
    title: "Source",
    detail: "",
    trustLevel: "verified",
    redactionStatus: "notNeeded",
    rawRetention: "summaryOnly",
    capturedAt: "2026-05-22T09:00:00Z",
    relatedEventIds: [],
    ...overrides,
  };
}

describe("deriveProjectIdentityHint", () => {
  it("prefers the existing session sourceLabel as a high-confidence hint", () => {
    const hint = deriveProjectIdentityHint({
      session: { ...session, sourceLabel: "C:\\dev\\mori" },
      sources: [],
    });

    expect(hint.projectLabel).toBe("mori");
    expect(hint.projectKey).toBe("c:/dev/mori");
    expect(hint.basis).toBe("sessionSourceLabel");
    expect(hint.confidence).toBe("high");
  });

  it("extracts a repository slug from source URIs", () => {
    const hint = deriveProjectIdentityHint({
      session,
      sources: [source({ uri: "https://github.com/openai/mori.git" })],
    });

    expect(hint.projectLabel).toBe("openai/mori");
    expect(hint.projectKey).toBe("openai/mori");
    expect(hint.basis).toBe("sourceUri");
    expect(hint.confidence).toBe("high");
  });

  it("uses path-like source details before falling back to projectId", () => {
    const hint = deriveProjectIdentityHint({
      session,
      sources: [source({ title: "git diff", detail: "/Users/me/projects/buywise" })],
    });

    expect(hint.projectLabel).toBe("buywise");
    expect(hint.basis).toBe("sourceDetail");
    expect(hint.confidence).toBe("medium");
  });

  it("falls back gracefully when only a session project id exists", () => {
    const hint = deriveProjectIdentityHint({ session, sources: [] });
    expect(hint.projectLabel).toBe("fallback-project");
    expect(hint.basis).toBe("sessionProjectId");
    expect(hint.confidence).toBe("low");
  });
});

import { describe, expect, it } from "vitest";
import { buildSourceWorkspace } from "./sourceWorkspace";
import {
  buildSourceProviderGroups,
  type SourceProvider,
} from "./sourceProviderGroups";

function allProviders(groups: ReturnType<typeof buildSourceProviderGroups>): SourceProvider[] {
  return [...groups.agents, ...groups.evidence, ...groups.planned];
}

function findMethodIds(provider: SourceProvider | undefined): string[] {
  return (provider?.methods ?? []).map((method) => method.source.id);
}

describe("buildSourceProviderGroups", () => {
  const vm = buildSourceWorkspace({ isDesktop: false, hasActiveSession: true });
  const groups = buildSourceProviderGroups(vm);

  it("lists the anchor agents in a fixed order, without ChatGPT", () => {
    expect(groups.agents.map((provider) => provider.id)).toEqual([
      "claude",
      "codex",
      "opencode",
      "antigravity",
      "continue",
      "cline",
      "cursor",
    ]);
  });

  it("classifies ChatGPT as evidence, not an anchor agent", () => {
    const agentIds = groups.agents.map((provider) => provider.id);
    const evidenceIds = groups.evidence.map((provider) => provider.id);
    expect(agentIds).not.toContain("chatgpt");
    expect(evidenceIds).toContain("chatgpt");
  });

  it("folds every Claude path into the single Claude provider", () => {
    const claude = groups.agents.find((provider) => provider.id === "claude");
    expect(claude).toBeDefined();
    const ids = findMethodIds(claude);
    expect(ids).toContain("claudeTranscript");
    expect(ids).toContain("claudeCodeHook");
    expect(ids).toContain("claudeDesktopExport");
    expect(ids).toContain("claudeWebExport");
    // Leads with an available method and flags the recommended hook path.
    expect(claude?.status).toBe("available");
    expect(claude?.recommended).toBe(true);
  });

  it("drops the redundant generic aiConversation row", () => {
    const ids = allProviders(groups).flatMap((provider) => findMethodIds(provider));
    expect(ids).not.toContain("aiConversation");
  });

  it("routes the universal paste surface under OpenCode", () => {
    const opencode = groups.agents.find((provider) => provider.id === "opencode");
    expect(findMethodIds(opencode)).toContain("aiTranscriptPaste");
  });

  it("groups evidence providers and keeps them out of the agent list", () => {
    const evidenceIds = groups.evidence.map((provider) => provider.id);
    expect(evidenceIds).toContain("git");
    expect(evidenceIds).toContain("terminal");
    expect(evidenceIds).toContain("note");
    expect(evidenceIds).toContain("url");
    expect(evidenceIds).toContain("connector");
    // No anchor agent ever lands in evidence. ChatGPT is evidence, not an anchor.
    for (const id of evidenceIds) {
      expect(["claude", "codex", "opencode"]).not.toContain(id);
    }
  });

  it("collapses fully-planned providers into the planned chip list", () => {
    const plannedIds = groups.planned.map((provider) => provider.id);
    // Future integrations and planned-only surfaces live here.
    expect(plannedIds).toContain("ide");
    expect(plannedIds.length).toBeGreaterThan(0);
    // MCP is now a docs-template capture path (a local server writing connector
    // JSONL), so it is a live evidence provider, not a planned chip.
    const evidenceIds = groups.evidence.map((provider) => provider.id);
    expect(evidenceIds).toContain("mcp");
    // No live agent ever lands in the planned bucket.
    for (const id of ["claude", "chatgpt", "codex", "opencode", "antigravity"]) {
      expect(plannedIds).not.toContain(id);
    }
  });

  it("never repeats a provider across the three buckets", () => {
    const ids = allProviders(groups).map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("accounts for every non-dropped source exactly once", () => {
    const expected = vm.sources
      .filter((source) => source.id !== "aiConversation")
      .map((source) => source.id)
      .sort();
    const seen = allProviders(groups)
      .flatMap((provider) => findMethodIds(provider))
      .sort();
    expect(seen).toEqual(expected);
  });

  it("attaches a connect-method chip to every method", () => {
    for (const provider of allProviders(groups)) {
      for (const method of provider.methods) {
        expect(method.connectLabel.length).toBeGreaterThan(0);
        expect(method.methodLabel.length).toBeGreaterThan(0);
      }
    }
  });
});

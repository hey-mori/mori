import { describe, expect, it } from "vitest";
import {
  getHubAiPlatform,
  getHubAvailableIntegrations,
  getHubCardActionLabel,
  getHubImportKind,
  getHubPlannedIntegrations,
  resolveImportLaunch,
} from "./integrationGroups";
import { SOURCE_REGISTRY } from "./sourceRegistry";

describe("integrationGroups", () => {
  describe("getHubAvailableIntegrations", () => {
    it("returns only user-facing implemented or partial integrations", () => {
      const available = getHubAvailableIntegrations();
      const ids = available.map((entry) => entry.id);

      expect(ids).toContain("claudeTranscript");
      expect(ids).toContain("chatgptTranscript");
      expect(ids).toContain("aiConversation");
      expect(ids).toContain("gitDiff");
      expect(ids).toContain("manualNote");
      expect(ids).toContain("url");
    });

    it("hides non-user-facing internal integrations", () => {
      const ids = getHubAvailableIntegrations().map((entry) => entry.id);
      expect(ids).not.toContain("quickPass");
      expect(ids).not.toContain("repository");
      expect(ids).not.toContain("tauriGitDiff");
    });

    it("never includes a planned integration", () => {
      const available = getHubAvailableIntegrations();
      available.forEach((entry) => {
        expect(["implemented", "partial"]).toContain(entry.status);
      });
    });

    it("orders AI transcripts before Git diff before manual note/URL", () => {
      const ids = getHubAvailableIntegrations().map((entry) => entry.id);
      const claudeIndex = ids.indexOf("claudeTranscript");
      const gitIndex = ids.indexOf("gitDiff");
      const manualIndex = ids.indexOf("manualNote");
      expect(claudeIndex).toBeGreaterThanOrEqual(0);
      expect(gitIndex).toBeGreaterThan(claudeIndex);
      expect(manualIndex).toBeGreaterThan(gitIndex);
    });
  });

  describe("getHubPlannedIntegrations", () => {
    it("returns only planned integrations", () => {
      const planned = getHubPlannedIntegrations();
      planned.forEach((entry) => {
        expect(entry.status).toBe("planned");
      });
    });

    it("includes the connectors documented in the screen reference", () => {
      const ids = getHubPlannedIntegrations().map((entry) => entry.id);
      expect(ids).toContain("vscode");
      expect(ids).toContain("cursor");
      expect(ids).toContain("terminal");
      expect(ids).toContain("browserTab");
      expect(ids).toContain("slack");
      expect(ids).toContain("notion");
      expect(ids).toContain("figma");
    });

    it("never includes an implemented integration", () => {
      const ids = getHubPlannedIntegrations().map((entry) => entry.id);
      expect(ids).not.toContain("manualNote");
      expect(ids).not.toContain("url");
      expect(ids).not.toContain("aiConversation");
      expect(ids).not.toContain("claudeTranscript");
      expect(ids).not.toContain("chatgptTranscript");
      expect(ids).not.toContain("codexTranscript");
      expect(ids).not.toContain("gitDiff");
    });
  });

  describe("getHubImportKind", () => {
    it("maps manual / url / git / ai integrations to their import kinds", () => {
      expect(getHubImportKind("manualNote")).toBe("note");
      expect(getHubImportKind("url")).toBe("url");
      expect(getHubImportKind("gitDiff")).toBe("git");
      expect(getHubImportKind("tauriGitDiff")).toBe("git");
      expect(getHubImportKind("claudeTranscript")).toBe("ai");
      expect(getHubImportKind("chatgptTranscript")).toBe("ai");
      expect(getHubImportKind("codexTranscript")).toBe("ai");
      expect(getHubImportKind("aiConversation")).toBe("ai");
    });

    it("returns null for non-importable integrations", () => {
      expect(getHubImportKind("quickPass")).toBeNull();
      expect(getHubImportKind("repository")).toBeNull();
      expect(getHubImportKind("vscode")).toBeNull();
      expect(getHubImportKind("nonexistent")).toBeNull();
    });
  });

  describe("getHubAiPlatform", () => {
    it("maps each AI transcript integration to its platform", () => {
      expect(getHubAiPlatform("claudeTranscript")).toBe("claude");
      expect(getHubAiPlatform("chatgptTranscript")).toBe("chatgpt");
      expect(getHubAiPlatform("codexTranscript")).toBe("codex");
      expect(getHubAiPlatform("aiConversation")).toBe("other");
    });

    it("returns null for non-AI integrations", () => {
      expect(getHubAiPlatform("manualNote")).toBeNull();
      expect(getHubAiPlatform("gitDiff")).toBeNull();
    });
  });

  describe("resolveImportLaunch", () => {
    it("resolves an AI transcript integration to its kind and platform", () => {
      expect(resolveImportLaunch("claudeTranscript")).toEqual({
        kind: "ai",
        platform: "claude",
      });
      expect(resolveImportLaunch("chatgptTranscript")).toEqual({
        kind: "ai",
        platform: "chatgpt",
      });
    });

    it("resolves a non-AI importable integration with a null platform", () => {
      expect(resolveImportLaunch("manualNote")).toEqual({ kind: "note", platform: null });
      expect(resolveImportLaunch("gitDiff")).toEqual({ kind: "git", platform: null });
      expect(resolveImportLaunch("connectorJsonl")).toEqual({
        kind: "connector",
        platform: null,
      });
    });

    it("returns null for planned or unknown integrations", () => {
      expect(resolveImportLaunch("vscode")).toBeNull();
      expect(resolveImportLaunch("slack")).toBeNull();
      expect(resolveImportLaunch("nonexistent")).toBeNull();
    });
  });

  describe("getHubCardActionLabel", () => {
    it("uses an active label for implemented integrations", () => {
      expect(getHubCardActionLabel(SOURCE_REGISTRY.manualNote)).toMatch(/메모/);
      expect(getHubCardActionLabel(SOURCE_REGISTRY.url)).toMatch(/URL/);
      expect(getHubCardActionLabel(SOURCE_REGISTRY.gitDiff)).toMatch(/Git/);
      expect(getHubCardActionLabel(SOURCE_REGISTRY.claudeTranscript)).toMatch(/AI/);
      expect(getHubCardActionLabel(SOURCE_REGISTRY.chatgptTranscript)).toMatch(/AI/);
      expect(getHubCardActionLabel(SOURCE_REGISTRY.codexTranscript)).toMatch(/AI/);
    });

    it("marks planned integrations with the 예정 label, not an active verb", () => {
      expect(getHubCardActionLabel(SOURCE_REGISTRY.vscode)).toBe("예정");
      expect(getHubCardActionLabel(SOURCE_REGISTRY.slack)).toBe("예정");
    });
  });
});

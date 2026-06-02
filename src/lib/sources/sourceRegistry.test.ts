import { describe, expect, it } from "vitest";
import {
  getImplementedIntegrations,
  getIntegration,
  getIntegrationsByStatus,
  getPlannedIntegrations,
  isIntegrationAvailable,
  SOURCE_REGISTRY,
} from "./sourceRegistry";

describe("sourceRegistry", () => {
  describe("SOURCE_REGISTRY", () => {
    it("includes all expected integrations", () => {
      const expectedIds = [
        "manualNote",
        "url",
        "aiConversation",
        "gitDiff",
        "tauriGitDiff",
        "repository",
        "quickPass",
        "terminal",
        "fileSystem",
        "editor",
        "vscode",
        "cursor",
        "browserTab",
        "claudeTranscript",
        "chatgptTranscript",
        "codexTranscript",
        "docs",
        "slack",
        "figma",
        "notion",
      ];

      expectedIds.forEach((id) => {
        expect(SOURCE_REGISTRY[id]).toBeDefined();
        expect(SOURCE_REGISTRY[id].id).toBe(id);
      });
    });

    it("has correct structure for each integration", () => {
      Object.values(SOURCE_REGISTRY).forEach((integration) => {
        expect(integration).toHaveProperty("id");
        expect(integration).toHaveProperty("label");
        expect(integration).toHaveProperty("description");
        expect(integration).toHaveProperty("status");
        expect(integration).toHaveProperty("trustDefault");
        expect(integration).toHaveProperty("rawDataPolicy");
        expect(integration).toHaveProperty("captureMode");
        expect(integration).toHaveProperty("privacyNote");
        expect(integration).toHaveProperty("supportedInputTypes");
        expect(integration).toHaveProperty("outputRecords");
      });
    });

    it("marks implemented integrations correctly", () => {
      const implemented = getImplementedIntegrations();
      const implementedIds = implemented.map((i) => i.id);

      expect(implementedIds).toContain("manualNote");
      expect(implementedIds).toContain("url");
      expect(implementedIds).toContain("aiConversation");
      expect(implementedIds).toContain("claudeTranscript");
      expect(implementedIds).toContain("chatgptTranscript");
      expect(implementedIds).toContain("codexTranscript");
      expect(implementedIds).toContain("antigravityTranscript");
      expect(implementedIds).toContain("opencodeTranscript");
      expect(implementedIds).toContain("continueTranscript");
      expect(implementedIds).toContain("clineTranscript");
      expect(implementedIds).toContain("gitDiff");
      expect(implementedIds).toContain("tauriGitDiff");
      expect(implementedIds).toContain("repository");
      expect(implementedIds).toContain("quickPass");

      // Should NOT contain planned integrations
      expect(implementedIds).not.toContain("terminal");
      expect(implementedIds).not.toContain("vscode");
      expect(implementedIds).not.toContain("slack");
    });

    it("marks planned integrations correctly", () => {
      const planned = getPlannedIntegrations();
      const plannedIds = planned.map((i) => i.id);

      expect(plannedIds).toContain("terminal");
      expect(plannedIds).toContain("fileSystem");
      expect(plannedIds).toContain("editor");
      expect(plannedIds).toContain("vscode");
      expect(plannedIds).toContain("cursor");
      expect(plannedIds).toContain("browserTab");
      expect(plannedIds).toContain("docs");
      expect(plannedIds).toContain("slack");
      expect(plannedIds).toContain("figma");
      expect(plannedIds).toContain("notion");

      // Should NOT contain implemented integrations
      expect(plannedIds).not.toContain("manualNote");
      expect(plannedIds).not.toContain("url");
      expect(plannedIds).not.toContain("claudeTranscript");
      expect(plannedIds).not.toContain("chatgptTranscript");
      expect(plannedIds).not.toContain("codexTranscript");
    });

    it("sets correct trust defaults", () => {
      // Manual inputs should be verified
      expect(SOURCE_REGISTRY.manualNote.trustDefault).toBe("verified");
      expect(SOURCE_REGISTRY.url.trustDefault).toBe("verified");
      expect(SOURCE_REGISTRY.gitDiff.trustDefault).toBe("verified");

      // Analysis should be inferred
      expect(SOURCE_REGISTRY.quickPass.trustDefault).toBe("inferred");

      // Planned observed sources
      expect(SOURCE_REGISTRY.terminal.trustDefault).toBe("observed");
      expect(SOURCE_REGISTRY.fileSystem.trustDefault).toBe("observed");
    });

    it("sets correct raw data policies", () => {
      expect(SOURCE_REGISTRY.manualNote.rawDataPolicy).toBe("retained");
      expect(SOURCE_REGISTRY.url.rawDataPolicy).toBe("retained");
      expect(SOURCE_REGISTRY.aiConversation.rawDataPolicy).toBe("summaryOnly");
      expect(SOURCE_REGISTRY.gitDiff.rawDataPolicy).toBe("retained");
      expect(SOURCE_REGISTRY.repository.rawDataPolicy).toBe("notCaptured");
    });

    it("sets correct capture modes", () => {
      expect(SOURCE_REGISTRY.manualNote.captureMode).toBe("manual");
      expect(SOURCE_REGISTRY.url.captureMode).toBe("manual");
      expect(SOURCE_REGISTRY.gitDiff.captureMode).toBe("manual");
      expect(SOURCE_REGISTRY.tauriGitDiff.captureMode).toBe("desktopCommand");
      expect(SOURCE_REGISTRY.terminal.captureMode).toBe("plannedConnector");
    });

    it("includes privacy notes for all integrations", () => {
      Object.values(SOURCE_REGISTRY).forEach((integration) => {
        expect(integration.privacyNote).toBeTruthy();
        expect(integration.privacyNote.length).toBeGreaterThan(10);
      });
    });

    it("sets correct output records", () => {
      // Import sources produce sources and events
      expect(SOURCE_REGISTRY.manualNote.outputRecords.sources).toBe(true);
      expect(SOURCE_REGISTRY.manualNote.outputRecords.timelineEvents).toBe(true);
      expect(SOURCE_REGISTRY.manualNote.outputRecords.issues).toBe(false);

      // Quick Pass produces issues, decisions, relationships
      expect(SOURCE_REGISTRY.quickPass.outputRecords.sources).toBe(false);
      expect(SOURCE_REGISTRY.quickPass.outputRecords.issues).toBe(true);
      expect(SOURCE_REGISTRY.quickPass.outputRecords.decisions).toBe(true);
      expect(SOURCE_REGISTRY.quickPass.outputRecords.relationships).toBe(true);

      // Repository settings don't produce any records
      expect(SOURCE_REGISTRY.repository.outputRecords.sources).toBe(false);
      expect(SOURCE_REGISTRY.repository.outputRecords.timelineEvents).toBe(false);
    });
  });

  describe("getIntegration", () => {
    it("returns integration for valid ID", () => {
      const integration = getIntegration("manualNote");
      expect(integration).toBeDefined();
      expect(integration?.id).toBe("manualNote");
      expect(integration?.label).toBe("직접 입력 메모");
    });

    it("returns undefined for invalid ID", () => {
      const integration = getIntegration("nonexistent");
      expect(integration).toBeUndefined();
    });
  });

  describe("getIntegrationsByStatus", () => {
    it("returns integrations with implemented status", () => {
      const implemented = getIntegrationsByStatus("implemented");
      expect(implemented.length).toBeGreaterThan(0);
      implemented.forEach((integration) => {
        expect(integration.status).toBe("implemented");
      });
    });

    it("returns integrations with planned status", () => {
      const planned = getIntegrationsByStatus("planned");
      expect(planned.length).toBeGreaterThan(0);
      planned.forEach((integration) => {
        expect(integration.status).toBe("planned");
      });
    });

    it("returns empty array for unused status", () => {
      const mockOnly = getIntegrationsByStatus("mockOnly");
      expect(mockOnly).toEqual([]);
    });
  });

  describe("getImplementedIntegrations", () => {
    it("returns only implemented integrations", () => {
      const implemented = getImplementedIntegrations();
      expect(implemented.length).toBeGreaterThan(0);
      implemented.forEach((integration) => {
        expect(integration.status).toBe("implemented");
      });
    });

    it("includes all expected implemented integrations", () => {
      const implemented = getImplementedIntegrations();
      const ids = implemented.map((i) => i.id);
      expect(ids).toContain("manualNote");
      expect(ids).toContain("url");
      expect(ids).toContain("aiConversation");
      expect(ids).toContain("gitDiff");
      expect(ids).toContain("tauriGitDiff");
    });
  });

  describe("getPlannedIntegrations", () => {
    it("returns only planned integrations", () => {
      const planned = getPlannedIntegrations();
      expect(planned.length).toBeGreaterThan(0);
      planned.forEach((integration) => {
        expect(integration.status).toBe("planned");
      });
    });

    it("includes expected planned integrations", () => {
      const planned = getPlannedIntegrations();
      const ids = planned.map((i) => i.id);
      expect(ids).toContain("terminal");
      expect(ids).toContain("vscode");
      expect(ids).toContain("slack");
    });
  });

  describe("isIntegrationAvailable", () => {
    describe("in browser mode (isTauri=false)", () => {
      it("returns true for implemented browser-compatible integrations", () => {
        expect(isIntegrationAvailable("manualNote", false)).toBe(true);
        expect(isIntegrationAvailable("url", false)).toBe(true);
        expect(isIntegrationAvailable("aiConversation", false)).toBe(true);
        expect(isIntegrationAvailable("gitDiff", false)).toBe(true);
      });

      it("returns false for desktop-only integrations", () => {
        expect(isIntegrationAvailable("tauriGitDiff", false)).toBe(false);
        expect(isIntegrationAvailable("repository", false)).toBe(false);
      });

      it("returns false for planned integrations", () => {
        expect(isIntegrationAvailable("terminal", false)).toBe(false);
        expect(isIntegrationAvailable("vscode", false)).toBe(false);
      });

      it("returns false for unavailable integrations", () => {
        expect(isIntegrationAvailable("nonexistent", false)).toBe(false);
      });
    });

    describe("in Tauri mode (isTauri=true)", () => {
      it("returns true for all implemented integrations", () => {
        expect(isIntegrationAvailable("manualNote", true)).toBe(true);
        expect(isIntegrationAvailable("url", true)).toBe(true);
        expect(isIntegrationAvailable("tauriGitDiff", true)).toBe(true);
        expect(isIntegrationAvailable("repository", true)).toBe(true);
      });

      it("returns false for planned integrations even in Tauri", () => {
        expect(isIntegrationAvailable("terminal", true)).toBe(false);
        expect(isIntegrationAvailable("vscode", true)).toBe(false);
      });

      it("returns false for unavailable integrations", () => {
        expect(isIntegrationAvailable("nonexistent", true)).toBe(false);
      });
    });
  });
});

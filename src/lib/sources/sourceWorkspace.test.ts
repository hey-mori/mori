import { describe, expect, it } from "vitest";
import {
  buildSourceWorkspace,
  findSourceWorkspaceSource,
  sourceKindForWorkspaceSource,
} from "./sourceWorkspace";

describe("buildSourceWorkspace", () => {
  it("builds a first-class catalogue that includes the core Mori sources", () => {
    const vm = buildSourceWorkspace({ isDesktop: true, hasActiveSession: true });
    const ids = vm.sources.map((source) => source.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        "aiTranscriptPaste",
        "claudeCodeHook",
        "codexCliWrapper",
        "chatgptTranscript",
        "openCodeCli",
        "connectorJsonl",
        "gitDiffPaste",
        "tauriGitDiff",
        "manualNote",
        "urlImport",
        "terminalShellIntegration",
      ]),
    );
  });

  it("keeps source actions honest when no editable session exists", () => {
    const vm = buildSourceWorkspace({ isDesktop: false, hasActiveSession: false });
    const connector = findSourceWorkspaceSource(vm, "connectorJsonl");
    const manual = findSourceWorkspaceSource(vm, "manualNote");

    expect(connector?.action.kind).toBe("import");
    expect(connector?.action.enabled).toBe(false);
    expect(manual?.action.kind).toBe("import");
    expect(manual?.action.enabled).toBe(false);
  });

  it("classifies desktop-only and setup-template sources separately", () => {
    const vm = buildSourceWorkspace({ isDesktop: false, hasActiveSession: true });

    expect(findSourceWorkspaceSource(vm, "tauriGitDiff")?.status).toBe("needsDesktopApp");
    expect(findSourceWorkspaceSource(vm, "repositoryMetadata")?.pathMode).toBe("requiredPath");
    expect(findSourceWorkspaceSource(vm, "claudeCodeHook")?.status).toBe("needsSetup");
    expect(findSourceWorkspaceSource(vm, "codexCliWrapper")?.recommended).toBe(true);
  });

  it("never presents planned future tools as connected", () => {
    const vm = buildSourceWorkspace({ isDesktop: true, hasActiveSession: true });

    for (const id of ["figma", "linear", "jira", "slack", "notion", "automation"]) {
      const source = findSourceWorkspaceSource(vm, id);
      expect(source).toBeTruthy();
      expect(source?.status).toBe("planned");
      expect(source?.action.kind).toBe("none");
      expect(source?.action.enabled).toBe(false);
      expect(source?.whatMoriCannotAccess.join(" ")).toMatch(/계정|백그라운드/);
    }
  });

  it("exposes privacy, accepted formats, created records, and review behavior", () => {
    const vm = buildSourceWorkspace({ isDesktop: true, hasActiveSession: true });

    for (const source of vm.sources) {
      expect(source.privacyNote.length).toBeGreaterThan(8);
      expect(source.acceptedFormats.length).toBeGreaterThan(0);
      expect(source.creates.length).toBeGreaterThan(0);
      expect(source.reviewBehavior.length).toBeGreaterThan(8);
      expect(source.whatMoriCannotAccess.length).toBeGreaterThan(0);
    }
  });

  it("maps visible source rows back to normalized source kinds when applicable", () => {
    const vm = buildSourceWorkspace({ isDesktop: true, hasActiveSession: true });

    expect(sourceKindForWorkspaceSource(findSourceWorkspaceSource(vm, "manualNote")!)).toBe(
      "manualNote",
    );
    expect(sourceKindForWorkspaceSource(findSourceWorkspaceSource(vm, "urlImport")!)).toBe("url");
    expect(sourceKindForWorkspaceSource(findSourceWorkspaceSource(vm, "connectorJsonl")!)).toBe(
      "connectorJsonl",
    );
  });
});

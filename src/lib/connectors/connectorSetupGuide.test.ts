import { describe, expect, it } from "vitest";
import { getCaptureSurfacesByStatus } from "./captureSurfaces";
import { getConnectorSetupGuide, hasConnectorSetupGuide } from "./connectorSetupGuide";

describe("getConnectorSetupGuide", () => {
  it("ships a guide for every docs-template local-capture surface", () => {
    const docsTemplate = getCaptureSurfacesByStatus("docsTemplateOnly");
    expect(docsTemplate.length).toBeGreaterThan(0);
    for (const row of docsTemplate) {
      const guide = getConnectorSetupGuide(row.id);
      expect(guide, `expected a setup guide for ${row.id}`).not.toBeNull();
      expect(guide?.steps.length).toBeGreaterThan(0);
      expect(guide?.templateDir).toContain("connectors/");
      // The import note routes the user back through the review gate.
      expect(guide?.importNote).toMatch(/가져오기|JSONL/);
    }
  });

  it("gives copyable steps a non-empty command", () => {
    const guide = getConnectorSetupGuide("codexCliWrapper");
    expect(guide).not.toBeNull();
    for (const step of guide!.steps) {
      if (step.command !== undefined) {
        expect(step.command.trim().length).toBeGreaterThan(0);
      }
      expect(step.text.trim().length).toBeGreaterThan(0);
    }
    // The Mori CLI is the preferred command; raw wrapper remains fallback.
    expect(guide!.steps.some((step) => step.command?.includes("mori.py run --connector codex"))).toBe(true);
    expect(guide!.steps.some((step) => step.command?.includes("mori-codex-wrapper"))).toBe(true);
    expect(guide!.steps.some((step) => step.command?.includes("codex run"))).toBe(true);
  });

  it("surfaces Mori CLI capture commands before raw local-capture fallback", () => {
    const guide = getConnectorSetupGuide("localCaptureBridge");
    expect(guide).not.toBeNull();
    expect(guide!.steps[0]?.command).toContain("connectors/mori-cli/mori.py capture");
    expect(guide!.steps.some((step) => step.command?.includes("mori-local-capture.py"))).toBe(true);
  });

  it("never instructs the user to provide an account, token, or run a watcher", () => {
    // Scan the step instructions only — the import note may legitimately
    // reassure that there is *no* watcher / daemon (a negation).
    for (const id of ["claudeCodeHook", "codexCliWrapper", "openCodeCli", "localCaptureBridge"] as const) {
      const guide = getConnectorSetupGuide(id);
      const steps = (guide?.steps.flatMap((s) => [s.text, s.command ?? ""]) ?? [])
        .join(" ")
        .toLowerCase();
      expect(steps).not.toMatch(/api key|token|oauth|password|watcher|daemon|로그인|계정 연결/);
    }
  });

  it("returns null for surfaces that need no setup guide", () => {
    expect(getConnectorSetupGuide("manualNote")).toBeNull();
    expect(getConnectorSetupGuide("aiTranscriptPaste")).toBeNull();
    expect(getConnectorSetupGuide("vscodeExtension")).toBeNull();
    expect(hasConnectorSetupGuide("manualNote")).toBe(false);
    expect(hasConnectorSetupGuide("openCodeCli")).toBe(true);
  });
});

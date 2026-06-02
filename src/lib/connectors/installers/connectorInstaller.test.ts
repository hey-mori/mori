import { describe, expect, it } from "vitest";

import {
  buildClaudeHookCommand,
  buildConnectorStatusViewModels,
  getConnectorInstallerMeta,
  listConnectorInstallers,
  type ConnectorDetectionResult,
} from "./connectorInstaller";

function find(
  models: ReturnType<typeof buildConnectorStatusViewModels>,
  id: ConnectorDetectionResult["id"],
) {
  const model = models.find((m) => m.id === id);
  if (!model) throw new Error(`missing view model for ${id}`);
  return model;
}

describe("connector installer registry", () => {
  it("lists the connectors with their capture models", () => {
    const installers = listConnectorInstallers();
    expect(installers.map((i) => i.id).sort()).toEqual([
      "antigravity",
      "claude-code",
      "cline",
      "codex-cli",
      "continue",
    ]);
    expect(getConnectorInstallerMeta("claude-code")?.captureModel).toBe("config-hook");
    expect(getConnectorInstallerMeta("codex-cli")?.captureModel).toBe("session-discovery");
    expect(getConnectorInstallerMeta("antigravity")?.captureModel).toBe("session-discovery");
    expect(getConnectorInstallerMeta("continue")?.captureModel).toBe("planned");
    expect(getConnectorInstallerMeta("cline")?.captureModel).toBe("planned");
    expect(getConnectorInstallerMeta("unknown" as never)).toBeUndefined();
  });

  it("matches the source-page anchor agents (continue and cline included)", () => {
    // The 소스 page lists continue and cline as anchor agents; the modal
    // registry must include them so the two surfaces never disagree.
    const ids = listConnectorInstallers().map((i) => i.id);
    expect(ids).toContain("continue");
    expect(ids).toContain("cline");
  });

  it("returns a fresh copy so callers cannot mutate the registry", () => {
    const a = listConnectorInstallers();
    a[0].displayName = "mutated";
    expect(listConnectorInstallers()[0].displayName).not.toBe("mutated");
  });
});

describe("buildConnectorStatusViewModels:browser mode", () => {
  it("marks detectable connectors desktop-only when detection is unsupported", () => {
    const models = buildConnectorStatusViewModels({
      runtimeSupportsDetection: false,
      results: [],
    });
    // Detectable (non-planned) connectors fall to desktop-only in the browser.
    const detectable = models.filter((model) => model.captureModel !== "planned");
    expect(detectable.length).toBeGreaterThan(0);
    for (const model of detectable) {
      expect(model.availability).toBe("desktopOnly");
      expect(model.canInstall).toBe(false);
      expect(model.detail.join(" ")).toContain("데스크톱");
    }
  });

  it("shows planned anchors (continue, cline) as planned in every runtime", () => {
    for (const runtimeSupportsDetection of [false, true]) {
      const models = buildConnectorStatusViewModels({
        runtimeSupportsDetection,
        results: [],
      });
      for (const id of ["continue", "cline"] as const) {
        const model = models.find((m) => m.id === id);
        expect(model?.availability).toBe("planned");
        expect(model?.canInstall).toBe(false);
      }
    }
  });
});

describe("buildConnectorStatusViewModels:Antigravity partial-capture note", () => {
  it("appends the partial-capture caveat when sessions are discovered", () => {
    const model = find(
      buildConnectorStatusViewModels({
        runtimeSupportsDetection: true,
        results: [{ id: "antigravity", toolInstalled: true, discoveredSessionCount: 2 }],
      }),
      "antigravity",
    );
    expect(model.availability).toBe("available");
    expect(model.canInstall).toBe(false);
    expect(model.detail.join(" ")).toContain("부분 캡처");
  });

  it("is unavailable when Antigravity is not installed", () => {
    const model = find(
      buildConnectorStatusViewModels({
        runtimeSupportsDetection: true,
        results: [{ id: "antigravity", toolInstalled: false }],
      }),
      "antigravity",
    );
    expect(model.availability).toBe("unavailable");
  });
});

describe("buildClaudeHookCommand", () => {
  it("invokes the .py via python on Windows", () => {
    expect(buildClaudeHookCommand("C:\\app\\connectors\\claude-code", "win32")).toBe(
      'python "C:\\app\\connectors\\claude-code\\mori-claude-hook.py"',
    );
  });

  it("uses the .sh launcher on POSIX", () => {
    expect(buildClaudeHookCommand("/opt/app/connectors/claude-code", "posix")).toBe(
      "/opt/app/connectors/claude-code/mori-claude-hook.sh",
    );
  });

  it("trims a trailing separator from the script dir", () => {
    expect(buildClaudeHookCommand("/opt/app/cc/", "posix")).toBe(
      "/opt/app/cc/mori-claude-hook.sh",
    );
    expect(buildClaudeHookCommand("C:\\app\\cc\\", "win32")).toBe(
      'python "C:\\app\\cc\\mori-claude-hook.py"',
    );
  });
});

describe("buildConnectorStatusViewModels:config-hook (Claude Code)", () => {
  function claude(result: Partial<ConnectorDetectionResult>) {
    return find(
      buildConnectorStatusViewModels({
        runtimeSupportsDetection: true,
        results: [{ id: "claude-code", toolInstalled: true, ...result }],
      }),
      "claude-code",
    );
  }

  it("is unavailable when the tool is not installed", () => {
    const model = find(
      buildConnectorStatusViewModels({
        runtimeSupportsDetection: true,
        results: [{ id: "claude-code", toolInstalled: false }],
      }),
      "claude-code",
    );
    expect(model.availability).toBe("unavailable");
    expect(model.canInstall).toBe(false);
  });

  it("requires setup and offers install when installed but not hooked", () => {
    const model = claude({ hookInstalled: false, toolVersion: "1.2.3" });
    expect(model.availability).toBe("requiresSetup");
    expect(model.canInstall).toBe(true);
    expect(model.detail.join(" ")).toContain("버전 1.2.3");
  });

  it("is available with scope when the hook is installed", () => {
    const global = claude({ hookInstalled: true, hookScope: "global" });
    expect(global.availability).toBe("available");
    expect(global.canInstall).toBe(false);
    expect(global.detail.join(" ")).toContain("전역");

    const project = claude({ hookInstalled: true, hookScope: "project" });
    expect(project.detail.join(" ")).toContain("프로젝트");
  });
});

describe("buildConnectorStatusViewModels:session-discovery (Codex)", () => {
  function codex(result: Partial<ConnectorDetectionResult>) {
    return find(
      buildConnectorStatusViewModels({
        runtimeSupportsDetection: true,
        results: [{ id: "codex-cli", toolInstalled: true, ...result }],
      }),
      "codex-cli",
    );
  }

  it("is unavailable when Codex is not installed", () => {
    const model = find(
      buildConnectorStatusViewModels({
        runtimeSupportsDetection: true,
        results: [{ id: "codex-cli", toolInstalled: false }],
      }),
      "codex-cli",
    );
    expect(model.availability).toBe("unavailable");
    expect(model.canInstall).toBe(false);
  });

  it("is available and never offers install when sessions are discovered", () => {
    const model = codex({ discoveredSessionCount: 66 });
    expect(model.availability).toBe("available");
    expect(model.canInstall).toBe(false);
    expect(model.detail.join(" ")).toContain("66개");
  });

  it("is partial when installed but no session history exists yet", () => {
    const model = codex({ discoveredSessionCount: 0 });
    expect(model.availability).toBe("partial");
    expect(model.canInstall).toBe(false);
  });
});

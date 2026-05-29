import { describe, expect, it } from "vitest";

import {
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
  it("lists both connectors with their capture models", () => {
    const installers = listConnectorInstallers();
    expect(installers.map((i) => i.id).sort()).toEqual(["claude-code", "codex-cli"]);
    expect(getConnectorInstallerMeta("claude-code")?.captureModel).toBe("config-hook");
    expect(getConnectorInstallerMeta("codex-cli")?.captureModel).toBe("session-discovery");
    expect(getConnectorInstallerMeta("unknown" as never)).toBeUndefined();
  });

  it("returns a fresh copy so callers cannot mutate the registry", () => {
    const a = listConnectorInstallers();
    a[0].displayName = "mutated";
    expect(listConnectorInstallers()[0].displayName).not.toBe("mutated");
  });
});

describe("buildConnectorStatusViewModels — browser mode", () => {
  it("marks every connector desktop-only when detection is unsupported", () => {
    const models = buildConnectorStatusViewModels({
      runtimeSupportsDetection: false,
      results: [],
    });
    expect(models).toHaveLength(2);
    for (const model of models) {
      expect(model.availability).toBe("desktopOnly");
      expect(model.canInstall).toBe(false);
      expect(model.detail.join(" ")).toContain("데스크톱");
    }
  });
});

describe("buildConnectorStatusViewModels — config-hook (Claude Code)", () => {
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

describe("buildConnectorStatusViewModels — session-discovery (Codex)", () => {
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

import { describe, expect, it } from "vitest";
import {
  buildConnectorStatusViewModels,
  type ConnectorStatusViewModel,
} from "../connectors/installers";
import {
  findConnectStatusForProvider,
  installerIdForProvider,
} from "./sourceConnectStatus";

const DESKTOP_MODELS: ConnectorStatusViewModel[] = buildConnectorStatusViewModels({
  runtimeSupportsDetection: true,
  results: [
    { id: "claude-code", toolInstalled: true, hookInstalled: true, hookScope: "global" },
    { id: "codex-cli", toolInstalled: true, discoveredSessionCount: 4 },
  ],
});

describe("installerIdForProvider", () => {
  it("maps anchor agents to their installer id", () => {
    expect(installerIdForProvider("claude")).toBe("claude-code");
    expect(installerIdForProvider("codex")).toBe("codex-cli");
    expect(installerIdForProvider("antigravity")).toBe("antigravity");
    expect(installerIdForProvider("continue")).toBe("continue");
    expect(installerIdForProvider("cline")).toBe("cline");
  });

  it("returns null for providers with no installer backing", () => {
    expect(installerIdForProvider("opencode")).toBeNull();
    expect(installerIdForProvider("cursor")).toBeNull();
    expect(installerIdForProvider("git")).toBeNull();
    expect(installerIdForProvider("unknown")).toBeNull();
  });
});

describe("findConnectStatusForProvider", () => {
  it("finds the live status model for a backed provider", () => {
    const claude = findConnectStatusForProvider("claude", DESKTOP_MODELS);
    expect(claude?.id).toBe("claude-code");
    expect(claude?.availability).toBe("available");

    const codex = findConnectStatusForProvider("codex", DESKTOP_MODELS);
    expect(codex?.id).toBe("codex-cli");
  });

  it("returns null for an unbacked provider even when models exist", () => {
    expect(findConnectStatusForProvider("opencode", DESKTOP_MODELS)).toBeNull();
  });

  it("returns null when the model set lacks the backed provider", () => {
    const onlyClaude = DESKTOP_MODELS.filter((model) => model.id === "claude-code");
    expect(findConnectStatusForProvider("continue", onlyClaude)).toBeNull();
  });
});

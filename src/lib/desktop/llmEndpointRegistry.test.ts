import { afterEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const isTauriMock = vi.fn();

vi.mock("./tauriCommands", () => ({
  invokeTauriCommand: (command: string, input: unknown) => invokeMock(command, input),
}));
vi.mock("./environment", () => ({
  isTauriRuntime: () => isTauriMock(),
}));

import { DEFAULT_QUICK_PASS_SETTINGS } from "../analysis/analysisSettings";
import { buildLlmEndpointEntries, syncLlmAllowedEndpoints } from "./llmEndpointRegistry";

afterEach(() => {
  invokeMock.mockReset();
  isTauriMock.mockReset();
});

describe("buildLlmEndpointEntries", () => {
  it("registers Ollama without authorization and the OpenAI-compatible base with it", () => {
    expect(buildLlmEndpointEntries(DEFAULT_QUICK_PASS_SETTINGS)).toEqual([
      { url: "http://localhost:11434", allowsAuthorization: false },
      { url: "http://localhost:1234/v1", allowsAuthorization: true },
    ]);
  });

  it("skips blank endpoints instead of registering empty origins", () => {
    expect(
      buildLlmEndpointEntries({ ollamaEndpoint: "   ", openAiBaseUrl: "http://192.168.0.5:8080/v1" }),
    ).toEqual([{ url: "http://192.168.0.5:8080/v1", allowsAuthorization: true }]);
  });
});

describe("syncLlmAllowedEndpoints", () => {
  it("invokes the registration command with the built entries on desktop", async () => {
    isTauriMock.mockReturnValue(true);
    invokeMock.mockResolvedValue(2);

    await syncLlmAllowedEndpoints(DEFAULT_QUICK_PASS_SETTINGS);

    expect(invokeMock).toHaveBeenCalledWith("set_llm_allowed_endpoints", {
      entries: [
        { url: "http://localhost:11434", allowsAuthorization: false },
        { url: "http://localhost:1234/v1", allowsAuthorization: true },
      ],
    });
  });

  it("is a no-op outside the Tauri runtime", async () => {
    isTauriMock.mockReturnValue(false);

    await syncLlmAllowedEndpoints(DEFAULT_QUICK_PASS_SETTINGS);

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("swallows bridge failures so settings persistence never throws", async () => {
    isTauriMock.mockReturnValue(true);
    invokeMock.mockRejectedValue(new Error("bridge down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(syncLlmAllowedEndpoints(DEFAULT_QUICK_PASS_SETTINGS)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

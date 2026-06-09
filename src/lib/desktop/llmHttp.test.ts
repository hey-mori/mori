import { afterEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const isTauriMock = vi.fn();

vi.mock("./tauriCommands", () => ({
  invokeTauriCommand: (command: string, input: unknown) => invokeMock(command, input),
}));
vi.mock("./environment", () => ({
  isTauriRuntime: () => isTauriMock(),
}));

import { getDefaultLlmFetch, tauriLlmFetch } from "./llmHttp";

afterEach(() => {
  invokeMock.mockReset();
  isTauriMock.mockReset();
});

describe("getDefaultLlmFetch", () => {
  it("returns undefined outside the desktop runtime (browser / tests)", () => {
    isTauriMock.mockReturnValue(false);
    expect(getDefaultLlmFetch()).toBeUndefined();
  });

  it("returns the native bridge in the desktop runtime", () => {
    isTauriMock.mockReturnValue(true);
    expect(getDefaultLlmFetch()).toBe(tauriLlmFetch);
  });
});

describe("tauriLlmFetch", () => {
  it("forwards method, normalized headers and body to the command, and shapes the response", async () => {
    invokeMock.mockResolvedValue({ status: 200, ok: true, body: '{"response":"hi"}' });

    const response = await tauriLlmFetch("http://localhost:11434/api/generate", {
      method: "post",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "x" }),
    });

    expect(invokeMock).toHaveBeenCalledWith("llm_http_request", {
      request: {
        url: "http://localhost:11434/api/generate",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"model":"x"}',
      },
    });
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"response":"hi"}');
  });

  it("parses the response body as JSON", async () => {
    invokeMock.mockResolvedValue({ status: 200, ok: true, body: '{"models":["a"]}' });
    const parsed = await tauriLlmFetch("http://x/api/tags").then((r) => r.json());
    expect(parsed).toEqual({ models: ["a"] });
  });

  it("normalizes a Headers instance into a plain record", async () => {
    invokeMock.mockResolvedValue({ status: 200, ok: true, body: "{}" });
    await tauriLlmFetch("http://x", { headers: new Headers({ Authorization: "Bearer k" }) });
    const arg = invokeMock.mock.calls[0]?.[1] as { request: { headers: Record<string, string> } };
    expect(arg.request.headers.authorization ?? arg.request.headers.Authorization).toBe("Bearer k");
  });

  it("rejects immediately when the abort signal is already aborted", async () => {
    invokeMock.mockResolvedValue({ status: 200, ok: true, body: "{}" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      tauriLlmFetch("http://x", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("rejects when the signal aborts before the command resolves", async () => {
    const controller = new AbortController();
    invokeMock.mockReturnValue(new Promise(() => {})); // never resolves
    const pending = tauriLlmFetch("http://x", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

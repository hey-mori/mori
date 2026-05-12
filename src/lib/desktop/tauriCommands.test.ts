import { describe, expect, it } from "vitest";
import { invokeTauriCommand } from "./tauriCommands";
import { isTauriRuntime } from "./environment";

describe("desktop command bridge", () => {
  it("detects non-Tauri web runtime", () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it("throws a clear error for desktop commands in web mode", async () => {
    await expect(invokeTauriCommand("get_app_info", undefined)).rejects.toThrow("requires the Tauri app");
  });
});

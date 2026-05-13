import { describe, expect, it } from "vitest";
import { pickRepositoryDirectory } from "./repositoryCommands";
import { isTauriRuntime } from "./environment";

describe("pickRepositoryDirectory browser fallback", () => {
  it("rejects with the desktop-required error when not in Tauri", async () => {
    expect(isTauriRuntime()).toBe(false);
    await expect(pickRepositoryDirectory()).rejects.toThrow("requires the Tauri app");
  });

  it("accepts an empty options object without throwing prematurely", async () => {
    await expect(pickRepositoryDirectory({})).rejects.toThrow("requires the Tauri app");
  });
});

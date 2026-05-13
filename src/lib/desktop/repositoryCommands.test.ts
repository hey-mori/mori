import { describe, expect, it } from "vitest";
import { pickRepositoryDirectory, verifyRepositoryPath } from "./repositoryCommands";
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

describe("verifyRepositoryPath browser fallback", () => {
  it("rejects empty repo paths before reaching the bridge", async () => {
    await expect(verifyRepositoryPath({ repoPath: "" })).rejects.toThrow("Repository path is required.");
    await expect(verifyRepositoryPath({ repoPath: "   " })).rejects.toThrow("Repository path is required.");
  });

  it("rejects with the desktop-required error when not in Tauri", async () => {
    await expect(verifyRepositoryPath({ repoPath: "C:/some/repo" })).rejects.toThrow("requires the Tauri app");
  });
});

import { describe, expect, it } from "vitest";
import { describeModelHeal, modelFamily, pickUsableModel } from "./modelSelfHeal";

describe("modelFamily", () => {
  it("strips the size or quantisation tag", () => {
    expect(modelFamily("qwen2.5:3b")).toBe("qwen2.5");
    expect(modelFamily("llama3.1:8b-instruct-q4_0")).toBe("llama3.1");
  });

  it("treats an untagged name as its own family", () => {
    expect(modelFamily("mistral")).toBe("mistral");
  });
});

describe("pickUsableModel", () => {
  const installed = ["qwen2.5:7b", "llama3.1:8b", "nomic-embed-text"];

  it("leaves an installed model alone", () => {
    // A user who deliberately picked a smaller model must not be upgraded.
    const result = pickUsableModel("llama3.1:8b", installed);
    expect(result).toEqual({
      model: "llama3.1:8b",
      changed: false,
      reason: "already-installed",
    });
  });

  it("prefers the same family when the configured tag is gone", () => {
    // The reported case: qwen2.5:3b configured, only qwen2.5:7b installed.
    const result = pickUsableModel("qwen2.5:3b", installed);
    expect(result.model).toBe("qwen2.5:7b");
    expect(result.changed).toBe(true);
    expect(result.reason).toBe("same-family");
  });

  it("falls back to the first installed model when no family matches", () => {
    const result = pickUsableModel("gemma2:9b", installed);
    expect(result.model).toBe("qwen2.5:7b");
    expect(result.reason).toBe("first-available");
  });

  it("picks something when nothing is configured yet", () => {
    const result = pickUsableModel("", installed);
    expect(result.model).toBe("qwen2.5:7b");
    expect(result.changed).toBe(true);
  });

  it("invents nothing when no models are installed", () => {
    // Keeping the configured name preserves the honest "model is missing"
    // error rather than hiding it behind an empty field.
    const result = pickUsableModel("qwen2.5:3b", []);
    expect(result).toEqual({
      model: "qwen2.5:3b",
      changed: false,
      reason: "nothing-installed",
    });
  });

  it("normalises a case-only difference once, then stops", () => {
    const first = pickUsableModel("Qwen2.5:7B", installed);
    expect(first.model).toBe("qwen2.5:7b");
    expect(first.changed).toBe(true);
    // Re-running must be stable, or every probe would report a repair.
    const second = pickUsableModel(first.model, installed);
    expect(second.changed).toBe(false);
  });

  it("ignores surrounding whitespace on both sides", () => {
    expect(pickUsableModel("  llama3.1:8b  ", installed).reason).toBe("already-installed");
    expect(pickUsableModel("llama3.1:8b", ["  llama3.1:8b  "]).changed).toBe(false);
  });
});

describe("describeModelHeal", () => {
  it("says nothing when nothing changed", () => {
    expect(
      describeModelHeal(
        { model: "a", changed: false, reason: "already-installed" },
        "a",
      ),
    ).toBeNull();
  });

  it("names both the missing model and the replacement", () => {
    const message = describeModelHeal(
      { model: "qwen2.5:7b", changed: true, reason: "same-family" },
      "qwen2.5:3b",
    );
    expect(message).toContain("qwen2.5:3b");
    expect(message).toContain("qwen2.5:7b");
  });

  it("does not claim a replacement when nothing was configured", () => {
    const message = describeModelHeal(
      { model: "qwen2.5:7b", changed: true, reason: "first-available" },
      "",
    );
    expect(message).toContain("qwen2.5:7b");
    expect(message).not.toContain("설치되어 있지 않아");
  });
});

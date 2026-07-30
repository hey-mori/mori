import { describe, expect, it } from "vitest";
import {
  describeModelHeal,
  isEmbeddingModel,
  modelFamily,
  parameterBillions,
  pickUsableModel,
  suggestSmallerModel,
} from "./modelSelfHeal";

describe("isEmbeddingModel", () => {
  it("recognises the common embedding families", () => {
    for (const name of [
      "nomic-embed-text",
      "mxbai-embed-large",
      "bge-m3",
      "all-minilm",
      "snowflake-arctic-embed2",
    ]) {
      expect(isEmbeddingModel(name), name).toBe(true);
    }
  });

  it("does not mistake a chat model for one", () => {
    for (const name of ["qwen2.5:7b", "llama3.1:8b", "gemma3:4b", "mistral"]) {
      expect(isEmbeddingModel(name), name).toBe(false);
    }
  });
});

describe("parameterBillions", () => {
  it("reads a size out of the tag", () => {
    expect(parameterBillions({ name: "qwen2.5:7b" })).toBe(7);
    expect(parameterBillions({ name: "gemma3:270m" })).toBeCloseTo(0.27);
  });

  it("prefers what the probe reported over the tag", () => {
    expect(parameterBillions({ name: "mystery:1b", parameterSize: "8.2B" })).toBe(8.2);
  });

  it("returns undefined when there is no size to read", () => {
    expect(parameterBillions({ name: "mistral" })).toBeUndefined();
  });
});

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

  it("falls back to the smallest text model when no family matches", () => {
    const result = pickUsableModel("gemma2:9b", installed);
    // qwen2.5:7b over llama3.1:8b, and never the embedding model.
    expect(result.model).toBe("qwen2.5:7b");
    expect(result.reason).toBe("smallest-available");
  });

  it("picks something when nothing is configured yet", () => {
    const result = pickUsableModel("", installed);
    expect(result.model).toBe("qwen2.5:7b");
    expect(result.changed).toBe(true);
  });

  it("never auto-selects an embedding model", () => {
    // These cannot generate text at all, so choosing one replaces a missing
    // model error with a confusing failure on every single run.
    const result = pickUsableModel("gone:1b", ["nomic-embed-text", "mxbai-embed-large"]);
    expect(result.reason).toBe("nothing-installed");
    expect(result.model).toBe("gone:1b");
  });

  it("still honours an embedding model the user typed themselves", () => {
    // Deliberate is deliberate; silently overriding it would be worse.
    const result = pickUsableModel("nomic-embed-text", ["nomic-embed-text", "qwen2.5:7b"]);
    expect(result.reason).toBe("already-installed");
    expect(result.changed).toBe(false);
  });

  it("prefers a smaller model over a larger one, because a timeout is not an answer", () => {
    // The reported case: the first repair chose a large model and the next run
    // timed out.
    const result = pickUsableModel("gone:1b", ["gemma3:27b", "gemma3:270m", "gemma3:4b"]);
    expect(result.model).toBe("gemma3:270m");
  });

  it("uses the probe's reported parameter size when the tag has none", () => {
    const result = pickUsableModel("gone:1b", [
      { name: "big-model", parameterSize: "70B" },
      { name: "small-model", parameterSize: "3.8B" },
    ]);
    expect(result.model).toBe("small-model");
  });

  it("falls back to on-disk size when no parameter count is known", () => {
    const result = pickUsableModel("gone:1b", [
      { name: "heavy", sizeBytes: 40_000_000_000 },
      { name: "light", sizeBytes: 2_000_000_000 },
    ]);
    expect(result.model).toBe("light");
  });

  it("prefers the smaller model within the matched family too", () => {
    const result = pickUsableModel("qwen2.5:3b", ["qwen2.5:72b", "qwen2.5:7b"]);
    expect(result.model).toBe("qwen2.5:7b");
    expect(result.reason).toBe("same-family");
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

describe("suggestSmallerModel", () => {
  // The reported install: a 9.6 GB model configured, a 1.9 GB one available.
  const real = [
    { name: "qwen2.5:3b", parameterSize: "3.1B", sizeBytes: 1_930_000_000 },
    { name: "qwen2.5-coder:7b", parameterSize: "7.6B", sizeBytes: 4_680_000_000 },
    { name: "gemma4:e4b", parameterSize: "8.0B", sizeBytes: 9_610_000_000 },
  ];

  it("offers the smallest model when the configured one is large", () => {
    expect(suggestSmallerModel("gemma4:e4b", real)).toBe("qwen2.5:3b");
  });

  it("offers nothing when the configured model is already the smallest", () => {
    expect(suggestSmallerModel("qwen2.5:3b", real)).toBeNull();
  });

  it("does not suggest a marginally smaller model", () => {
    // A 7b suggesting a 6b is noise, not help.
    expect(
      suggestSmallerModel("a:7b", [{ name: "a:7b" }, { name: "b:6b" }]),
    ).toBeNull();
  });

  it("never suggests an embedding model", () => {
    expect(
      suggestSmallerModel("gemma4:e4b", [
        { name: "gemma4:e4b", parameterSize: "8.0B" },
        { name: "nomic-embed-text", parameterSize: "0.1B" },
      ]),
    ).toBeNull();
  });

  it("offers nothing when the configured model is not installed", () => {
    // That is the heal's job, not this one's.
    expect(suggestSmallerModel("not-installed:70b", real)).toBeNull();
  });

  it("offers nothing when sizes cannot be compared", () => {
    expect(
      suggestSmallerModel("mystery", [{ name: "mystery" }, { name: "other" }]),
    ).toBeNull();
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
      { model: "qwen2.5:7b", changed: true, reason: "smallest-available" },
      "",
    );
    expect(message).toContain("qwen2.5:7b");
    expect(message).not.toContain("설치되어 있지 않아");
  });
});

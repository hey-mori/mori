import { describe, expect, it } from "vitest";
import { DEFAULT_QUICK_PASS_SETTINGS, type QuickPassAnalysisSettings } from "./analysisSettings";
import {
  applyEnginePreset,
  captureEnginePreset,
  findMatchingPresetId,
  loadEnginePresets,
  saveEnginePresets,
} from "./enginePresets";

function settings(patch: Partial<QuickPassAnalysisSettings> = {}): QuickPassAnalysisSettings {
  return { ...DEFAULT_QUICK_PASS_SETTINGS, ...patch };
}

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("captureEnginePreset", () => {
  it("snapshots engine fields, trims the name, and omits the disclosure level", () => {
    const preset = captureEnginePreset(
      "p1",
      "  깊은 로컬  ",
      settings({ provider: "ollama", ollamaModel: "qwen2.5", requestDisclosureLevel: "hidden" }),
    );
    expect(preset.name).toBe("깊은 로컬");
    expect(preset.settings.provider).toBe("ollama");
    expect(preset.settings.ollamaModel).toBe("qwen2.5");
    expect("requestDisclosureLevel" in preset.settings).toBe(false);
  });
});

describe("applyEnginePreset", () => {
  it("merges engine fields while preserving the disclosure level", () => {
    const preset = captureEnginePreset("p1", "API", settings({ provider: "openAiCompatible", openAiModel: "gpt-x" }));
    const current = settings({ provider: "deterministic", requestDisclosureLevel: "abstract" });
    const next = applyEnginePreset(current, preset);
    expect(next.provider).toBe("openAiCompatible");
    expect(next.openAiModel).toBe("gpt-x");
    expect(next.requestDisclosureLevel).toBe("abstract");
  });
});

describe("findMatchingPresetId", () => {
  it("returns the id of the preset matching the current engine settings", () => {
    const ollama = captureEnginePreset("a", "deep", settings({ provider: "ollama", ollamaModel: "qwen2.5" }));
    const api = captureEnginePreset("b", "api", settings({ provider: "openAiCompatible" }));
    const current = settings({ provider: "ollama", ollamaModel: "qwen2.5", requestDisclosureLevel: "hidden" });
    expect(findMatchingPresetId(current, [ollama, api])).toBe("a");
  });

  it("returns null when no preset matches", () => {
    const ollama = captureEnginePreset("a", "deep", settings({ provider: "ollama", ollamaModel: "qwen2.5" }));
    const current = settings({ provider: "ollama", ollamaModel: "llama3.1:8b" });
    expect(findMatchingPresetId(current, [ollama])).toBeNull();
  });
});

describe("loadEnginePresets / saveEnginePresets", () => {
  it("round-trips presets through storage", () => {
    const storage = fakeStorage();
    const presets = [
      captureEnginePreset("a", "fast", settings({ provider: "deterministic" })),
      captureEnginePreset("b", "deep", settings({ provider: "ollama", ollamaModel: "qwen2.5" })),
    ];
    saveEnginePresets(presets, storage);
    const loaded = loadEnginePresets(storage);
    expect(loaded).toHaveLength(2);
    expect(loaded[1].name).toBe("deep");
    expect(loaded[1].settings.ollamaModel).toBe("qwen2.5");
  });

  it("drops malformed entries and survives bad JSON", () => {
    const storage = fakeStorage();
    storage.setItem("mori.quickPassPresets.v1", JSON.stringify([{ id: "ok", name: "ok", settings: {} }, { name: "no id" }, 42]));
    const loaded = loadEnginePresets(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("ok");
    // A normalized default fills in the engine fields for the kept entry.
    expect(loaded[0].settings.provider).toBe("deterministic");

    storage.setItem("mori.quickPassPresets.v1", "not json");
    expect(loadEnginePresets(storage)).toEqual([]);
  });
});

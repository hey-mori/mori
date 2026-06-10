import { describe, expect, it } from "vitest";
import { DEFAULT_QUICK_PASS_SETTINGS, type QuickPassAnalysisSettings } from "./analysisSettings";
import { captureEnginePreset, type EnginePreset } from "./enginePresets";
import {
  BUILTIN_ENGINE_ID,
  CUSTOM_ENGINE_ID,
  engineEndpoint,
  engineModel,
  listEngineProfiles,
  newEngineProfile,
  removeEngineProfile,
  resolveActiveEngineId,
  settingsForEngine,
  upsertEngineProfile,
} from "./engineProfiles";

const ollamaSettings: QuickPassAnalysisSettings = {
  ...DEFAULT_QUICK_PASS_SETTINGS,
  provider: "ollama",
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "qwen2.5:3b",
};

const savedOllama: EnginePreset = captureEnginePreset("p1", "로컬 Qwen", ollamaSettings);

describe("engineEndpoint / engineModel", () => {
  it("reads the provider-relevant endpoint and model", () => {
    expect(engineEndpoint(ollamaSettings)).toBe("http://localhost:11434");
    expect(engineModel(ollamaSettings)).toBe("qwen2.5:3b");
    expect(engineEndpoint(DEFAULT_QUICK_PASS_SETTINGS)).toBe("");
    expect(engineModel(DEFAULT_QUICK_PASS_SETTINGS)).toBe("");
  });
});

describe("resolveActiveEngineId", () => {
  it("is the built-in id when the live engine is the no-model one", () => {
    expect(resolveActiveEngineId(DEFAULT_QUICK_PASS_SETTINGS, [])).toBe(BUILTIN_ENGINE_ID);
  });

  it("is a saved profile id when the live settings match it", () => {
    expect(resolveActiveEngineId(ollamaSettings, [savedOllama])).toBe("p1");
  });

  it("is the custom id when a live LLM config matches nothing saved", () => {
    expect(resolveActiveEngineId(ollamaSettings, [])).toBe(CUSTOM_ENGINE_ID);
  });
});

describe("listEngineProfiles", () => {
  it("always includes the built-in and marks exactly one active", () => {
    const views = listEngineProfiles(DEFAULT_QUICK_PASS_SETTINGS, [savedOllama]);
    expect(views.map((v) => v.id)).toEqual([BUILTIN_ENGINE_ID, "p1"]);
    expect(views.filter((v) => v.active).map((v) => v.id)).toEqual([BUILTIN_ENGINE_ID]);
    expect(views[0].builtin).toBe(true);
  });

  it("surfaces an unsaved custom entry when the live LLM config matches nothing", () => {
    const views = listEngineProfiles(ollamaSettings, []);
    expect(views[0].id).toBe(CUSTOM_ENGINE_ID);
    expect(views[0].unsaved).toBe(true);
    expect(views[0].active).toBe(true);
    expect(views[0].localityLabel).toBe("로컬 · 외부 전송 없음");
  });

  it("marks the matching saved profile active and decorates its provider + locality", () => {
    const views = listEngineProfiles(ollamaSettings, [savedOllama]);
    const active = views.find((v) => v.active)!;
    expect(active.id).toBe("p1");
    expect(active.name).toBe("로컬 Qwen");
    expect(active.providerLabel).toBe("Ollama");
    expect(active.model).toBe("qwen2.5:3b");
  });
});

describe("settingsForEngine", () => {
  it("switches to the no-model engine for the built-in id", () => {
    const next = settingsForEngine(ollamaSettings, BUILTIN_ENGINE_ID, []);
    expect(next.provider).toBe("deterministic");
  });

  it("applies a saved profile's settings", () => {
    const next = settingsForEngine(DEFAULT_QUICK_PASS_SETTINGS, "p1", [savedOllama]);
    expect(next.provider).toBe("ollama");
    expect(next.ollamaModel).toBe("qwen2.5:3b");
  });
});

describe("profile library mutations", () => {
  it("seeds a new profile with the provider defaults", () => {
    const profile = newEngineProfile("new1", "내 Ollama", "ollama");
    expect(profile.settings.provider).toBe("ollama");
    expect(profile.settings.ollamaEndpoint).toBe("http://localhost:11434");
    expect(profile.name).toBe("내 Ollama");
  });

  it("upserts by id and removes by id", () => {
    const added = upsertEngineProfile([], savedOllama);
    expect(added).toHaveLength(1);
    const edited = upsertEngineProfile(added, { ...savedOllama, name: "이름 변경" });
    expect(edited).toHaveLength(1);
    expect(edited[0].name).toBe("이름 변경");
    expect(removeEngineProfile(edited, "p1")).toHaveLength(0);
  });
});

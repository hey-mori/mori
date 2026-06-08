import { describe, expect, it } from "vitest";
import { getFeature } from "../../app/featureStatus";
import {
  buildStartSessionEngineOptions,
  coerceStartSessionEngineProvider,
  getDefaultStartSessionEngineOption,
} from "./startSessionEngineOptions";

describe("Start Session engine options", () => {
  it("offers the three canonical engines in order", () => {
    const options = buildStartSessionEngineOptions();
    expect(options.map((option) => option.provider)).toEqual([
      "deterministic",
      "ollama",
      "openAiCompatible",
    ]);
  });

  it("always makes 규칙 기반 selectable without a connection", () => {
    const options = buildStartSessionEngineOptions();
    const deterministic = options.find((option) => option.provider === "deterministic");
    expect(deterministic?.selectable).toBe(true);
    expect(deterministic?.status).toBe("implemented");
  });

  it("derives model-engine availability from the feature-status registry", () => {
    const options = buildStartSessionEngineOptions();
    for (const option of options) {
      if (!option.featureId) continue;
      const feature = getFeature(option.featureId);
      expect(option.status).toBe(feature.status);
      expect(option.selectable).toBe(feature.actionEnabled);
    }
  });

  it("uses the first selectable provider as the default", () => {
    const defaultOption = getDefaultStartSessionEngineOption();
    expect(defaultOption.provider).toBe("deterministic");
    expect(defaultOption.selectable).toBe(true);
  });

  it("keeps a known provider, coerces an unavailable one to the default", () => {
    expect(coerceStartSessionEngineProvider("deterministic")).toBe("deterministic");
    expect(coerceStartSessionEngineProvider("ollama")).toBe("ollama");
    expect(coerceStartSessionEngineProvider("openAiCompatible")).toBe("openAiCompatible");
    // lmStudio / cloudApi are no longer offered here, so they fall back.
    expect(coerceStartSessionEngineProvider("lmStudio")).toBe("deterministic");
    expect(coerceStartSessionEngineProvider("cloudApi")).toBe("deterministic");
  });
});

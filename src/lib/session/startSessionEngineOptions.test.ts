import { describe, expect, it } from "vitest";
import { getFeature } from "../../app/featureStatus";
import type { LlmProvider } from "../../domain/types";
import {
  buildStartSessionEngineOptions,
  coerceStartSessionEngineProvider,
  getDefaultStartSessionEngineOption,
} from "./startSessionEngineOptions";

describe("Start Session engine options", () => {
  it("derives provider availability from the feature-status registry", () => {
    const options = buildStartSessionEngineOptions();
    for (const option of options) {
      const feature = getFeature(option.featureId);
      expect(option.status).toBe(feature.status);
      expect(option.selectable).toBe(feature.actionEnabled);
    }
  });

  it("keeps planned providers visible but not selectable", () => {
    const options = buildStartSessionEngineOptions();
    for (const provider of [
      "lmStudio",
      "cloudApi",
    ] satisfies LlmProvider[]) {
      const option = options.find((candidate) => candidate.provider === provider);
      expect(option).toBeDefined();
      expect(option?.status).toBe("planned");
      expect(option?.selectable).toBe(false);
      expect(option?.disabledReason).toBeTruthy();
      expect(option?.disabledReason).not.toMatch(/planned milestone/i);
    }
  });

  it("uses the first real provider as the default", () => {
    const defaultOption = getDefaultStartSessionEngineOption();
    expect(defaultOption.provider).toBe("ollama");
    expect(defaultOption.selectable).toBe(true);
  });

  it("coerces a planned provider back to the default selectable option", () => {
    expect(coerceStartSessionEngineProvider("lmStudio")).toBe("ollama");
    expect(coerceStartSessionEngineProvider("cloudApi")).toBe("ollama");
    expect(coerceStartSessionEngineProvider("openAiCompatible")).toBe("openAiCompatible");
    expect(coerceStartSessionEngineProvider("ollama")).toBe("ollama");
  });
});

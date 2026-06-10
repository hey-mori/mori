/**
 * Engine profiles — the user-facing model for "분석 엔진".
 *
 * A profile is a saved, named, fully-configured engine: a provider (from the
 * registry) plus its endpoint / model / key. The user keeps a small library of
 * them ("로컬 Qwen", "회사 GPT-4o-mini") and one is active.
 *
 * Design that avoids two sources of truth: the live `QuickPassAnalysisSettings`
 * in the store stays THE active engine config that runs. A profile is "active"
 * when its settings match the live ones — derived, not a stored pointer that can
 * drift. The built-in 규칙 기반 baseline is always present (and never editable or
 * deletable), so there is always at least one engine. When the live settings
 * match no saved profile, the list surfaces a "사용자 지정" entry the user can
 * save. This layer is a pure view-model + helpers; storage stays in
 * `enginePresets.ts`, the run pipeline keeps reading `analysisSettings`.
 */
import {
  DEFAULT_QUICK_PASS_SETTINGS,
  type QuickPassAnalysisSettings,
  type QuickPassProviderKind,
} from "./analysisSettings";
import {
  applyEnginePreset,
  captureEnginePreset,
  findMatchingPresetId,
  normalizeEngineSettings,
  type EnginePreset,
  type EnginePresetSettings,
} from "./enginePresets";
import { getEngineProvider } from "./engineProviders";
import {
  classifyEndpointLocality,
  describeEndpointLocality,
  type EndpointLocality,
} from "./endpointLocality";

export const BUILTIN_ENGINE_ID = "builtin-deterministic";
export const CUSTOM_ENGINE_ID = "custom-current";

export type EngineProfileView = {
  id: string;
  name: string;
  providerKind: QuickPassProviderKind;
  providerLabel: string;
  isLlm: boolean;
  /** Built-in baseline (규칙 기반): selectable but not editable or deletable. */
  builtin: boolean;
  /** The live, unsaved current config when it matches no saved profile. */
  unsaved: boolean;
  /** Connection endpoint ("" for the no-model engine). */
  endpoint: string;
  /** Model name ("" for the no-model engine). */
  model: string;
  /** Endpoint locality for an LLM engine, else null. */
  locality: EndpointLocality | null;
  localityLabel: string | null;
  /** Whether this profile is the active engine (matches the live settings). */
  active: boolean;
};

/** The configured connection endpoint for a settings/profile object. */
export function engineEndpoint(settings: EnginePresetSettings | QuickPassAnalysisSettings): string {
  if (settings.provider === "ollama") return settings.ollamaEndpoint;
  if (settings.provider === "openAiCompatible") return settings.openAiBaseUrl;
  return "";
}

/** The configured model name for a settings/profile object. */
export function engineModel(settings: EnginePresetSettings | QuickPassAnalysisSettings): string {
  if (settings.provider === "ollama") return settings.ollamaModel;
  if (settings.provider === "openAiCompatible") return settings.openAiModel;
  return "";
}

/**
 * The id of the active engine: a matching saved profile, else the built-in
 * baseline (for the no-model engine), else `CUSTOM_ENGINE_ID` (live LLM config
 * the user has not saved as a profile).
 */
export function resolveActiveEngineId(
  settings: QuickPassAnalysisSettings,
  presets: readonly EnginePreset[],
): string {
  const matched = findMatchingPresetId(settings, presets as EnginePreset[]);
  if (matched) return matched;
  return settings.provider === "deterministic" ? BUILTIN_ENGINE_ID : CUSTOM_ENGINE_ID;
}

function builtinProfileView(active: boolean): EngineProfileView {
  const provider = getEngineProvider("deterministic");
  return {
    id: BUILTIN_ENGINE_ID,
    name: provider.label,
    providerKind: "deterministic",
    providerLabel: provider.label,
    isLlm: false,
    builtin: true,
    unsaved: false,
    endpoint: "",
    model: "",
    locality: null,
    localityLabel: null,
    active,
  };
}

function profileViewFrom(
  id: string,
  name: string,
  settings: EnginePresetSettings,
  active: boolean,
  options: { builtin?: boolean; unsaved?: boolean } = {},
): EngineProfileView {
  const provider = getEngineProvider(settings.provider);
  const endpoint = engineEndpoint(settings);
  const locality = provider.isLlm ? classifyEndpointLocality(endpoint) : null;
  return {
    id,
    name: name.trim() || provider.label,
    providerKind: settings.provider,
    providerLabel: provider.label,
    isLlm: provider.isLlm,
    builtin: options.builtin ?? false,
    unsaved: options.unsaved ?? false,
    endpoint,
    model: engineModel(settings),
    locality,
    localityLabel: locality ? describeEndpointLocality(locality) : null,
    active,
  };
}

/** A view for one saved profile. */
export function buildEngineProfileView(preset: EnginePreset, active: boolean): EngineProfileView {
  return profileViewFrom(preset.id, preset.name, preset.settings, active);
}

/**
 * The full engine library, in display order: the live unsaved config (only when
 * it matches nothing), then the built-in baseline, then saved profiles. Exactly
 * one entry is `active`.
 */
export function listEngineProfiles(
  settings: QuickPassAnalysisSettings,
  presets: readonly EnginePreset[],
): EngineProfileView[] {
  const activeId = resolveActiveEngineId(settings, presets);
  const views: EngineProfileView[] = [];
  if (activeId === CUSTOM_ENGINE_ID) {
    views.push(
      profileViewFrom(CUSTOM_ENGINE_ID, "사용자 지정", normalizeEngineSettings(settings), true, {
        unsaved: true,
      }),
    );
  }
  views.push(builtinProfileView(activeId === BUILTIN_ENGINE_ID));
  for (const preset of presets) {
    views.push(buildEngineProfileView(preset, preset.id === activeId));
  }
  return views;
}

/** The settings that selecting an engine should apply to the live config. */
export function settingsForEngine(
  current: QuickPassAnalysisSettings,
  engineId: string,
  presets: readonly EnginePreset[],
): QuickPassAnalysisSettings {
  if (engineId === BUILTIN_ENGINE_ID) {
    return { ...current, provider: "deterministic" };
  }
  if (engineId === CUSTOM_ENGINE_ID) return current;
  const preset = presets.find((entry) => entry.id === engineId);
  return preset ? applyEnginePreset(current, preset) : current;
}

/** A fresh profile seeded with a provider's defaults, ready for the editor. */
export function newEngineProfile(
  id: string,
  name: string,
  kind: QuickPassProviderKind,
): EnginePreset {
  const provider = getEngineProvider(kind);
  const seeded: QuickPassAnalysisSettings = {
    ...DEFAULT_QUICK_PASS_SETTINGS,
    provider: kind,
  };
  if (kind === "ollama") {
    seeded.ollamaEndpoint = provider.defaultEndpoint;
    seeded.ollamaModel = provider.defaultModel;
  } else if (kind === "openAiCompatible") {
    seeded.openAiBaseUrl = provider.defaultEndpoint;
    seeded.openAiModel = provider.defaultModel;
  }
  return captureEnginePreset(id, name, seeded);
}

/** Upsert a profile into the library (replace by id, else append). */
export function upsertEngineProfile(
  presets: readonly EnginePreset[],
  profile: EnginePreset,
): EnginePreset[] {
  const exists = presets.some((entry) => entry.id === profile.id);
  return exists
    ? presets.map((entry) => (entry.id === profile.id ? profile : entry))
    : [...presets, profile];
}

/** Remove a profile from the library. */
export function removeEngineProfile(
  presets: readonly EnginePreset[],
  id: string,
): EnginePreset[] {
  return presets.filter((entry) => entry.id !== id);
}

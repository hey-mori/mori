import {
  DEFAULT_QUICK_PASS_SETTINGS,
  sanitizeQuickPassSettings,
  type QuickPassAnalysisSettings,
} from "./analysisSettings";

/**
 * Engine presets: named snapshots of a Quick Pass engine configuration so a
 * user can keep "fast local", "deep local", "high-quality API" and switch
 * between them in one click. Device-local UI convenience, persisted directly
 * in localStorage like the workbench layout presets (not durable memory, not
 * synced).
 *
 * A preset captures only the engine-relevant fields. `requestDisclosureLevel`
 * is a privacy display setting, not engine config, so applying a preset never
 * changes it.
 */

export type EnginePresetSettings = Omit<QuickPassAnalysisSettings, "requestDisclosureLevel">;

export type EnginePreset = {
  id: string;
  name: string;
  settings: EnginePresetSettings;
};

export const ENGINE_PRESETS_KEY = "mori.quickPassPresets.v1";

const ENGINE_FIELDS = [
  "provider",
  "ollamaEndpoint",
  "ollamaModel",
  "ollamaTimeoutMs",
  "openAiBaseUrl",
  "openAiModel",
  "openAiApiKey",
  "openAiTimeoutMs",
  "fallbackToDeterministic",
  "requestAbstractionModel",
] as const satisfies readonly (keyof EnginePresetSettings)[];

/** Sanitize an arbitrary value and keep only the engine-relevant fields. */
export function normalizeEngineSettings(input: unknown): EnginePresetSettings {
  const sane = sanitizeQuickPassSettings(input);
  return {
    provider: sane.provider,
    ollamaEndpoint: sane.ollamaEndpoint,
    ollamaModel: sane.ollamaModel,
    ollamaTimeoutMs: sane.ollamaTimeoutMs,
    openAiBaseUrl: sane.openAiBaseUrl,
    openAiModel: sane.openAiModel,
    openAiApiKey: sane.openAiApiKey,
    openAiTimeoutMs: sane.openAiTimeoutMs,
    fallbackToDeterministic: sane.fallbackToDeterministic,
    requestAbstractionModel: sane.requestAbstractionModel,
  };
}

/** Snapshot the current settings as a named preset. The caller supplies the id. */
export function captureEnginePreset(
  id: string,
  name: string,
  settings: QuickPassAnalysisSettings,
): EnginePreset {
  return { id, name: name.trim(), settings: normalizeEngineSettings(settings) };
}

/**
 * Merge a preset's engine settings onto the current settings, preserving
 * non-engine fields (the request disclosure level). Returns sanitized
 * settings ready to persist.
 */
export function applyEnginePreset(
  settings: QuickPassAnalysisSettings,
  preset: EnginePreset,
): QuickPassAnalysisSettings {
  return sanitizeQuickPassSettings({ ...settings, ...preset.settings });
}

function engineSettingsEqual(a: EnginePresetSettings, b: EnginePresetSettings): boolean {
  return ENGINE_FIELDS.every((key) => a[key] === b[key]);
}

/**
 * The id of the preset whose engine settings match the current settings, or
 * null when none does. Lets the UI mark the active preset without storing a
 * separate pointer that could drift from the live settings.
 */
export function findMatchingPresetId(
  settings: QuickPassAnalysisSettings,
  presets: EnginePreset[],
): string | null {
  const current = normalizeEngineSettings(settings);
  const match = presets.find((preset) =>
    engineSettingsEqual(current, normalizeEngineSettings({ ...DEFAULT_QUICK_PASS_SETTINGS, ...preset.settings })),
  );
  return match?.id ?? null;
}

type PresetStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): PresetStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Load saved engine presets, dropping any malformed entry. Never throws. */
export function loadEnginePresets(storage: PresetStorage | null = defaultStorage()): EnginePreset[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ENGINE_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const presets: EnginePreset[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Partial<EnginePreset>;
      if (typeof candidate.id !== "string" || typeof candidate.name !== "string") continue;
      presets.push({
        id: candidate.id,
        name: candidate.name,
        settings: normalizeEngineSettings(candidate.settings),
      });
    }
    return presets;
  } catch {
    return [];
  }
}

/** Persist engine presets. Best-effort; never throws. */
export function saveEnginePresets(
  presets: EnginePreset[],
  storage: PresetStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(ENGINE_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Best-effort; presets are a device-local convenience.
  }
}

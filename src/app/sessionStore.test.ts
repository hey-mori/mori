import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  selectHasRealAnalysis,
  setSessionRepositoryForTesting,
  useMoriSessionStore,
} from "./sessionStore";
import { createSessionDraft } from "../lib/session/createSessionDraft";
import { normalizeManualNote } from "../lib/import";
import { BrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../lib/storage/memoryStorage";
import type { MoriAnalysisProvider, MoriAnalysisResult } from "../lib/analysis";
import { DEFAULT_QUICK_PASS_SETTINGS } from "../lib/analysis";

const fixedNow = "2026-05-12T13:00:00+09:00";

function buildProvider(name: MoriAnalysisProvider["name"], opts: { fail?: boolean; label?: string } = {}): MoriAnalysisProvider {
  return {
    name,
    label: opts.label ?? name,
    requiresNetwork: name === "ollama-quick-pass-v1",
    async analyze(input): Promise<MoriAnalysisResult> {
      if (opts.fail) throw new Error("provider boom");
      const runId = `run-${name}-${input.session.id}`;
      return {
        runId,
        providerName: name,
        providerLabel: opts.label ?? name,
        sessionId: input.session.id,
        projectId: input.project.id,
        generatedAt: fixedNow,
        durationMs: 1,
        inputEventCount: input.events.length,
        inputSourceCount: input.sources.length,
        summary: { sessionSummary: `from ${name}`, resumePrompt: "prompt", highlights: [] },
        issues: [],
        decisions: [],
        relationships: [],
        nextActions: [],
        rendered: {
          summary: {
            id: `summary-${runId}`,
            sessionId: input.session.id,
            sessionSummary: `from ${name}`,
            resumePrompt: "prompt",
            reportMarkdown: "",
            nextActionIds: [],
            generatedAt: fixedNow,
          },
        },
        confidence: 0.5,
        notes: [],
      };
    },
  };
}

function resetStore() {
  useMoriSessionStore.setState({
    initialized: false,
    draft: null,
    imports: [],
    analysis: null,
    analysisStatus: "idle",
    analysisError: null,
    analysisProviderLabel: null,
    analysisFallbackUsed: false,
    analysisSettings: { ...DEFAULT_QUICK_PASS_SETTINGS },
  });
}

describe("useMoriSessionStore Quick Pass provider flow", () => {
  beforeEach(() => {
    const storage = new MemoryKeyValueStorage();
    const repository = new BrowserDraftRepository(storage);
    setSessionRepositoryForTesting(repository);
    resetStore();
  });

  afterEach(() => {
    setSessionRepositoryForTesting(null);
    resetStore();
  });

  function seedDraftWithImport() {
    const draft = useMoriSessionStore.getState();
    const builtDraft = createSessionDraft({
      sessionTitle: "Quick Pass test",
      projectName: "QP Project",
      selectedSources: [],
      recordingMode: "summary",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      storageLocation: "~/Mori/Records",
      now: fixedNow,
    });
    const stored = {
      ...builtDraft,
      savedAt: fixedNow,
      adapter: "browser-local-storage" as const,
    };
    draft.setDraft(stored);

    const note = normalizeManualNote({
      projectId: stored.project.id,
      sessionId: stored.session.id,
      title: "Risk",
      note: "위험: token rotation 미정. TODO: rotate.",
      capturedAt: fixedNow,
    });
    useMoriSessionStore.getState().addImport(note);
  }

  it("persists provider settings through the repository boundary", () => {
    const next = useMoriSessionStore.getState().updateAnalysisSettings({
      provider: "ollama",
      ollamaEndpoint: "http://localhost:9999",
      fallbackToDeterministic: false,
    });
    expect(next.provider).toBe("ollama");

    resetStore();
    useMoriSessionStore.getState().hydrate();
    const hydrated = useMoriSessionStore.getState().analysisSettings;
    expect(hydrated.provider).toBe("ollama");
    expect(hydrated.ollamaEndpoint).toBe("http://localhost:9999");
    expect(hydrated.fallbackToDeterministic).toBe(false);
  });

  it("falls back to deterministic when Ollama fails and fallback is enabled", async () => {
    seedDraftWithImport();
    useMoriSessionStore.getState().updateAnalysisSettings({ provider: "ollama" });

    const failingOllama = buildProvider("ollama-quick-pass-v1", { fail: true, label: "Ollama fail" });
    useMoriSessionStore.setState({ analysisSettings: { ...useMoriSessionStore.getState().analysisSettings, fallbackToDeterministic: true } });

    // The store reads provider config from settings, not direct injection. To test
    // fallback we monkey-patch resolveProviderFromSettings via passing primary explicitly.
    const result = await useMoriSessionStore.getState().runQuickPass(failingOllama);

    expect(result).not.toBeNull();
    const state = useMoriSessionStore.getState();
    expect(state.analysisStatus).toBe("succeeded");
    expect(state.analysisFallbackUsed).toBe(true);
    expect(state.analysis?.providerName).toBe("deterministic-heuristic-v1");
    expect(state.analysis?.notes.some((note) => note.includes("Fell back"))).toBe(true);
  });

  it("surfaces the error and does not pretend success when fallback is disabled", async () => {
    seedDraftWithImport();
    useMoriSessionStore.getState().updateAnalysisSettings({ provider: "ollama", fallbackToDeterministic: false });

    const failingOllama = buildProvider("ollama-quick-pass-v1", { fail: true, label: "Ollama fail" });
    const result = await useMoriSessionStore.getState().runQuickPass(failingOllama);

    expect(result).toBeNull();
    const state = useMoriSessionStore.getState();
    expect(state.analysisStatus).toBe("failed");
    expect(state.analysisFallbackUsed).toBe(false);
    expect(state.analysisError).toContain("provider boom");
    expect(selectHasRealAnalysis(state)).toBe(false);
  });

  it("succeeds without fallback when the chosen provider works", async () => {
    seedDraftWithImport();
    useMoriSessionStore.getState().updateAnalysisSettings({ provider: "ollama" });

    const workingOllama = buildProvider("ollama-quick-pass-v1", { label: "Ollama ok" });
    const result = await useMoriSessionStore.getState().runQuickPass(workingOllama);

    expect(result).not.toBeNull();
    const state = useMoriSessionStore.getState();
    expect(state.analysisStatus).toBe("succeeded");
    expect(state.analysisFallbackUsed).toBe(false);
    expect(state.analysis?.providerName).toBe("ollama-quick-pass-v1");
    expect(state.analysisProviderLabel).toBe("Ollama ok");
  });
});

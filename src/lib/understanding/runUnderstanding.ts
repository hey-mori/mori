/**
 * Point the local engine Mori already owns at one note.
 *
 * This adds no plumbing. Endpoint, model, timeout, the desktop fetch bridge and
 * the settings surface all shipped for session analysis; the only thing missing
 * was a caller that hands it a document instead of a session. `AnalysisProvider`
 * itself is session-shaped (project / session / events), so the call is made
 * directly rather than bent through that contract.
 *
 * The engine is optional by construction: with no local model configured, a note
 * simply has no reading, and every region stays empty. An empty region is
 * honest (v6, v7 §4); a fabricated one is the failure this work exists to end.
 */
import type { QuickPassAnalysisSettings } from "../analysis/analysisSettings";
import { getDefaultLlmFetch } from "../desktop/llmHttp";
import { parseUnderstanding } from "./understandingParse";
import {
  buildUnderstandingPrompt,
  UNDERSTANDING_SYSTEM_PROMPT,
  type UnderstandingPromptArgs,
} from "./understandingPrompt";
import type { DocumentUnderstanding } from "./understandingTypes";

export type UnderstandingEngine =
  | { kind: "none" }
  | { kind: "ollama"; endpoint: string; model: string; timeoutMs: number }
  | { kind: "openAiCompatible"; baseUrl: string; model: string; apiKey: string; timeoutMs: number };

/** Read the engine out of the settings the user already configured. Anything
 *  other than a real local model reads as "no engine", including the
 *  deterministic provider: it cannot summarize or gloss a term, so pretending it
 *  is an engine here would put keyword output under a heading that promises
 *  understanding. */
export function engineFromSettings(settings: QuickPassAnalysisSettings): UnderstandingEngine {
  if (settings.provider === "ollama" && settings.ollamaEndpoint && settings.ollamaModel) {
    return {
      kind: "ollama",
      endpoint: settings.ollamaEndpoint,
      model: settings.ollamaModel,
      timeoutMs: settings.ollamaTimeoutMs,
    };
  }
  if (settings.provider === "openAiCompatible" && settings.openAiBaseUrl && settings.openAiModel) {
    return {
      kind: "openAiCompatible",
      baseUrl: settings.openAiBaseUrl,
      model: settings.openAiModel,
      apiKey: settings.openAiApiKey,
      timeoutMs: settings.openAiTimeoutMs,
    };
  }
  return { kind: "none" };
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export type RunUnderstandingArgs = UnderstandingPromptArgs & {
  engine: UnderstandingEngine;
  knownSchemaIds: readonly string[];
  now: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

/**
 * Read a note, or return null. Null is a first-class outcome: no engine, a
 * refusal, a timeout, or a reply nothing in could be verified all mean the same
 * thing to the surface, which is that there is no reading to show.
 */
export async function runUnderstanding(
  args: RunUnderstandingArgs,
): Promise<DocumentUnderstanding | null> {
  if (args.engine.kind === "none") return null;
  const fetchImpl = args.fetchImpl ?? getDefaultLlmFetch();
  if (!fetchImpl) return null;

  const prompt = buildUnderstandingPrompt(args);
  const raw = await callEngine(args.engine, prompt, fetchImpl, args.signal);
  if (raw === null) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  return parseUnderstanding({
    raw: parsedJson,
    body: args.body,
    now: args.now,
    knownSchemaIds: args.knownSchemaIds,
  });
}

async function callEngine(
  engine: Exclude<UnderstandingEngine, { kind: "none" }>,
  prompt: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), engine.timeoutMs) : null;
  const abortSignal = signal ?? controller?.signal;

  try {
    if (engine.kind === "ollama") {
      const response = await fetchImpl(`${stripTrailingSlash(engine.endpoint)}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortSignal,
        body: JSON.stringify({
          model: engine.model,
          system: UNDERSTANDING_SYSTEM_PROMPT,
          prompt,
          stream: false,
          // The reply is a contract, not prose: constrain it and take the
          // deterministic sample.
          format: "json",
          options: { temperature: 0 },
        }),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { response?: string; done_reason?: string };
      // A truncated reply is not a partial reading, it is an unparseable one.
      if (payload.done_reason === "length") return null;
      return typeof payload.response === "string" ? payload.response : null;
    }

    const response = await fetchImpl(`${stripTrailingSlash(engine.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(engine.apiKey ? { Authorization: `Bearer ${engine.apiKey}` } : {}),
      },
      signal: abortSignal,
      body: JSON.stringify({
        model: engine.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: UNDERSTANDING_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  } catch {
    // A dead endpoint, a timeout, or an abort all mean "no reading". The surface
    // shows nothing rather than a stale or invented one.
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

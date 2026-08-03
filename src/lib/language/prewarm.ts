/**
 * Model pre-warm.
 *
 * Measured on this machine with `qwen2.5:3b`: a cold call spent **9,876ms** of
 * its 10,682ms total inside `load_duration`. Once warm the same call took
 * ~1,490ms. Generation was ~400ms in both cases, so the first use of the day is
 * dominated entirely by loading the model.
 *
 * `keep_alive` does not solve this. It keeps an already-loaded model resident,
 * which is why the warm number is warm, but it cannot help the first request.
 * Only asking for the load before the user needs an answer can.
 *
 * Rules:
 *  - Fire and forget. A pre-warm that fails changes nothing; the real request
 *    will surface the error properly.
 *  - Generate nothing. `num_predict: 0` asks Ollama to load and stop, so this
 *    costs a load and no tokens.
 *  - Local providers only. A cloud endpoint has no model to resident-ise, and
 *    sending anything to one before the user has asked for a translation would
 *    break the consent rule.
 *  - Never send user text. The prompt is empty.
 */
import type { QuickPassAnalysisSettings } from "../analysis/analysisSettings";
import { streamText } from "../desktop/llmStreamBridge";

/** Suppresses a second pre-warm while one is already in flight, and after one
 *  has succeeded for the same model: the point is to pay the load once. */
let warmedModel: string | null = null;
let inFlight: Promise<void> | null = null;

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * Ask the configured local model to load, if it is worth doing.
 *
 * Returns a promise that always resolves; callers are expected not to await it.
 */
export function prewarmLanguageModel(
  settings: QuickPassAnalysisSettings | undefined,
): Promise<void> {
  // Only Ollama. An OpenAI-compatible endpoint may be remote, and there is no
  // load to trigger on a hosted model.
  if (!settings || settings.provider !== "ollama") return Promise.resolve();
  const model = settings.ollamaModel?.trim();
  const endpoint = settings.ollamaEndpoint?.trim();
  if (!model || !endpoint) return Promise.resolve();

  if (warmedModel === model) return Promise.resolve();
  if (inFlight) return inFlight;

  const run = streamText(
    {
      url: `${stripTrailingSlash(endpoint)}/api/generate`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: "",
        stream: false,
        keep_alive: "10m",
        // Load the model and generate nothing.
        options: { num_predict: 0 },
      }),
      // Shorter than a real request: a pre-warm that is still going when the
      // user asks a question has already lost its race and should get out of
      // the way rather than hold a connection.
      timeoutMs: 20_000,
    },
    () => {
      // The body is not interesting; only the load it forced.
    },
  )
    .then(() => {
      warmedModel = model;
    })
    .catch(() => {
      // Deliberately silent. The user did not ask for this, so a failure must
      // not produce an error state; the next real request reports honestly.
    })
    .finally(() => {
      inFlight = null;
    });

  inFlight = run;
  return run;
}

/** Forget the warm state, so changing the model warms the new one. */
export function resetPrewarmState(): void {
  warmedModel = null;
  inFlight = null;
}

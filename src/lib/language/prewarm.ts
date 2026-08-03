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

/**
 * How long a warm is assumed to hold.
 *
 * Slightly under the `keep_alive` sent with every request, so the marker
 * expires before the model actually does rather than after. Without a TTL the
 * marker outlives the residency and a later request silently pays a cold load
 * while we believe the model is warm.
 */
const WARM_TTL_MS = 8 * 60 * 1000;

type WarmState = { model: string; at: number } | null;

/** Suppresses a second pre-warm while one is already in flight, and for as long
 *  as the last one can be believed. */
let warmed: WarmState = null;
let inFlight: Promise<void> | null = null;

/**
 * Whether a warm is worth sending. Pure, so the policy is testable without a
 * network or a clock.
 *
 * Returns false when the model is already believed warm, and true once that
 * belief has expired: a warm that has gone stale is exactly when the next
 * request would otherwise pay a full cold load.
 */
export function shouldPrewarm(model: string, state: WarmState, now: number): boolean {
  if (!state) return true;
  if (state.model !== model) return true;
  return now - state.at >= WARM_TTL_MS;
}

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

  if (!shouldPrewarm(model, warmed, Date.now())) return Promise.resolve();
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
      // Generous on purpose, and this was originally wrong. The first version
      // capped at 20s reasoning that a warm still running when the user asks
      // has "lost its race" and should get out of the way. That is backwards:
      // Ollama serialises requests per model, so a load already in progress is
      // exactly what the user's request then benefits from, and killing it
      // throws the work away and guarantees they pay for it again.
      //
      // 20s was also simply too short. A cold 2GB load competing with Mori's
      // own startup I/O timed out every time, and the deliberately silent catch
      // meant it looked like the warm had never been attempted at all.
      timeoutMs: 180_000,
    },
    () => {
      // The body is not interesting; only the load it forced.
    },
  )
    .then(() => {
      warmed = { model, at: Date.now() };
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
  warmed = null;
  inFlight = null;
}

import { isTauriRuntime } from "./environment";
import { invokeTauriCommand } from "./tauriCommands";

/**
 * Native HTTP bridge for local-LLM calls.
 *
 * Ollama and some OpenAI-compatible servers reject the CORS preflight that a
 * `Content-Type: application/json` POST from the Tauri webview origin triggers,
 * which the browser reports as an opaque "Failed to fetch". Routing the request
 * through the Rust `llm_http_request` command sidesteps browser CORS entirely,
 * so the local model is reachable with no `OLLAMA_ORIGINS` configuration.
 *
 * The analysis providers accept a `fetchImpl: typeof fetch`, so this exposes a
 * `fetch`-compatible function that the desktop build injects. In the browser /
 * tests, {@link getDefaultLlmFetch} returns `undefined` and the providers fall
 * back to the global `fetch`, leaving non-desktop behavior unchanged.
 */

/** Mirrors the Rust `LlmHttpRequest` (camelCase). */
export type LlmHttpRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

/** Mirrors the Rust `LlmHttpResponse`. */
export type LlmHttpResponse = {
  status: number;
  ok: boolean;
  body: string;
};

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** Flatten any `HeadersInit` shape to a plain record the command can serialize. */
function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  for (const [key, value] of Object.entries(headers)) out[key] = value;
  return out;
}

/** Build the minimal `Response` surface the analysis providers consume. */
function toResponse(result: LlmHttpResponse): Response {
  const surface = {
    ok: result.ok,
    status: result.status,
    text: () => Promise.resolve(result.body),
    json: () => Promise.resolve(JSON.parse(result.body)),
  };
  return surface as unknown as Response;
}

/**
 * A `fetch`-compatible function that performs the request natively via Rust.
 * Honors `init.signal` so the providers' `AbortController` timeout still
 * rejects the call (the native request continues in the background, which is
 * acceptable for a one-shot analysis pass).
 */
export async function tauriLlmFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = normalizeHeaders(init?.headers);
  const body =
    typeof init?.body === "string" ? init.body : init?.body == null ? undefined : String(init.body);
  const signal = init?.signal ?? undefined;
  if (signal?.aborted) throw abortError();

  const call = invokeTauriCommand("llm_http_request", {
    request: { url, method, headers, ...(body !== undefined ? { body } : {}) },
  }).then(toResponse);

  if (!signal) return call;
  return Promise.race([
    call,
    new Promise<Response>((_, reject) => {
      signal.addEventListener("abort", () => reject(abortError()), { once: true });
    }),
  ]);
}

/**
 * The default `fetchImpl` for local-LLM providers: the native bridge in the
 * desktop app, or `undefined` in the browser / tests so the providers keep
 * using the global `fetch`.
 */
export function getDefaultLlmFetch(): typeof fetch | undefined {
  return isTauriRuntime() ? (tauriLlmFetch as typeof fetch) : undefined;
}

/**
 * One streaming call, two transports.
 *
 * The desktop app cannot use `fetch` for local-LLM calls: Ollama rejects the
 * CORS preflight from the Tauri webview origin, which is why `llm_http_request`
 * exists. That command buffers a whole response, so streaming needs its own
 * native path (`llm_http_stream`, pushing chunks over a Tauri channel).
 *
 * Callers should not have to know any of that. `streamText` picks the transport
 * and exposes the same contract either way: chunks as they arrive, a real
 * cancellation, and a status.
 *
 * Cancellation differs meaningfully between the two and both are honoured:
 *  - Browser: `fetch` takes the signal directly and aborting closes the socket.
 *  - Desktop: aborting invokes `cancel_llm_stream`, which flips a flag the Rust
 *    read loop checks; dropping the response there closes the connection. The
 *    old bridge only stopped the renderer waiting while generation continued.
 */
import { isTauriRuntime } from "./environment";
import { invokeTauriCommand } from "./tauriCommands";

export type StreamTextRequest = {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

export type StreamTextResult = {
  status: number;
  ok: boolean;
  /** True when the caller aborted. Not an error: a superseded request is normal. */
  cancelled: boolean;
};

/** Mirrors the Rust `LlmStreamEvent` tag union. */
type NativeStreamEvent =
  | { kind: "open"; status: number; ok: boolean }
  | { kind: "chunk"; text: string }
  | { kind: "done"; status: number; ok: boolean }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** Monotonic per-process id. Only ever used to address a cancel. */
let nextRequestId = 0;
function makeRequestId(): string {
  nextRequestId += 1;
  return `llm-stream-${nextRequestId}`;
}

/**
 * Stream a response body, calling `onChunk` with each piece of text.
 *
 * Resolves when the body ends or the caller cancels. Rejects only on a real
 * failure, so a cancelled request is a resolved result with `cancelled: true`
 * rather than an exception the caller has to classify.
 */
export async function streamText(
  request: StreamTextRequest,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamTextResult> {
  if (signal?.aborted) throw abortError();
  return isTauriRuntime()
    ? streamViaNativeBridge(request, onChunk, signal)
    : streamViaFetch(request, onChunk, signal);
}

async function streamViaNativeBridge(
  request: StreamTextRequest,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamTextResult> {
  const { Channel } = await import("@tauri-apps/api/core");
  const requestId = makeRequestId();

  let status = 0;
  let ok = false;
  let cancelled = false;
  let failure: string | null = null;

  const channel = new Channel<NativeStreamEvent>();
  channel.onmessage = (event) => {
    switch (event.kind) {
      case "open":
        status = event.status;
        ok = event.ok;
        break;
      case "chunk":
        onChunk(event.text);
        break;
      case "done":
        status = event.status;
        ok = event.ok;
        break;
      case "cancelled":
        cancelled = true;
        break;
      case "error":
        failure = event.message;
        break;
    }
  };

  // Registered before the call so an abort that arrives while the request is
  // still being set up is not lost.
  const onAbort = () => {
    cancelled = true;
    void invokeTauriCommand("cancel_llm_stream", { requestId }).catch(() => {
      // Cancelling a stream that already finished is expected and harmless.
    });
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await invokeTauriCommand("llm_http_stream", {
      request: {
        requestId,
        url: request.url,
        method: request.method ?? "POST",
        headers: request.headers ?? {},
        ...(request.body !== undefined ? { body: request.body } : {}),
        ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
      },
      onEvent: channel,
    });
  } catch (error) {
    // A cancel races the command's own rejection; the cancel wins because the
    // caller already knows it asked for this.
    if (cancelled || signal?.aborted) return { status, ok, cancelled: true };
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }

  if (cancelled || signal?.aborted) return { status, ok, cancelled: true };
  if (failure) throw new Error(failure);
  return { status, ok, cancelled: false };
}

async function streamViaFetch(
  request: StreamTextRequest,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamTextResult> {
  const response = await fetch(request.url, {
    method: request.method ?? "POST",
    headers: request.headers,
    body: request.body,
    signal,
  });

  const status = response.status;
  const ok = response.ok;

  // No readable body: a server, proxy or test double answered without one.
  // Falling back to the whole text keeps the caller working rather than
  // silently producing an empty answer.
  if (!response.body) {
    const text = await response.text();
    if (text) onChunk(text);
    return { status, ok, cancelled: false };
  }

  const reader = response.body.getReader();
  // `stream: true` is what makes the decoder hold a character split across two
  // chunks instead of emitting a replacement character at every boundary.
  const decoder = new TextDecoder("utf-8");
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) onChunk(text);
    }
    const tail = decoder.decode();
    if (tail) onChunk(tail);
  } catch (error) {
    if (signal?.aborted) return { status, ok, cancelled: true };
    throw error;
  } finally {
    // Releasing lets the connection close promptly on an early exit.
    reader.releaseLock();
  }

  return { status, ok, cancelled: false };
}

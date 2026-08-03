/**
 * Incremental parsers for the two streaming wire formats.
 *
 * Pure and stateful-by-instance, deliberately separate from any transport. A
 * network chunk boundary lands wherever the socket happens to break, so the one
 * property that matters here is that **every parser must survive being fed the
 * same bytes in any chunking**. That is exactly what is impossible to eyeball
 * and easy to unit test, which is why this is its own module.
 *
 * Both parsers only ever ADD text. Neither decides when a request is finished:
 * that belongs to the transport, which knows whether the connection closed
 * cleanly or was cancelled.
 */

/** Timing and token counts Ollama reports on its final chunk, in milliseconds. */
export type OllamaStreamStats = {
  /** Time spent loading the model. Non-zero even when it is resident. */
  loadMs?: number;
  /** Time spent evaluating the prompt. */
  promptEvalMs?: number;
  /** Time spent generating. */
  generationMs?: number;
  totalMs?: number;
  promptTokens?: number;
  outputTokens?: number;
};

const NANOS_PER_MS = 1_000_000;

function toMs(nanos: unknown): number | undefined {
  return typeof nanos === "number" && Number.isFinite(nanos) ? nanos / NANOS_PER_MS : undefined;
}

function toCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Ollama's `/api/generate` with `stream: true` emits one JSON object per line.
 *
 * The final object carries `done: true` plus the timing fields that let us tell
 * a slow model load apart from a long prompt apart from slow generation, which
 * is the whole point of instrumenting this path.
 */
export class OllamaStreamParser {
  private buffer = "";
  private stats: OllamaStreamStats | null = null;
  private done = false;

  /** Feed a chunk; returns whatever new response text it contained. */
  push(chunk: string): string {
    this.buffer += chunk;
    let out = "";

    // Only complete lines are parseable. Anything after the last newline is a
    // partial object and waits for the next chunk.
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      out += this.consumeLine(line);
      newline = this.buffer.indexOf("\n");
    }
    return out;
  }

  /** Flush a trailing object with no newline after it. */
  finish(): string {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest ? this.consumeLine(rest) : "";
  }

  private consumeLine(line: string): string {
    if (!line) return "";
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // A malformed line is dropped rather than thrown: one bad object must not
      // discard a generation that is otherwise arriving correctly.
      return "";
    }

    if (payload.done === true) {
      this.done = true;
      this.stats = {
        loadMs: toMs(payload.load_duration),
        promptEvalMs: toMs(payload.prompt_eval_duration),
        generationMs: toMs(payload.eval_duration),
        totalMs: toMs(payload.total_duration),
        promptTokens: toCount(payload.prompt_eval_count),
        outputTokens: toCount(payload.eval_count),
      };
    }

    // Ollama reports an error mid-stream as a field rather than an HTTP status.
    if (typeof payload.error === "string" && payload.error) {
      throw new Error(`Ollama: ${payload.error}`);
    }

    return typeof payload.response === "string" ? payload.response : "";
  }

  get statistics(): OllamaStreamStats | null {
    return this.stats;
  }

  get isDone(): boolean {
    return this.done;
  }
}

/**
 * OpenAI-compatible `chat/completions` with `stream: true` emits Server-Sent
 * Events: `data: {json}` lines, blank lines between frames, `data: [DONE]` last.
 *
 * Parsed line by line rather than frame by frame. A frame is only ever one
 * `data:` line for this API, and line-based parsing is what keeps the
 * chunk-boundary handling identical to the Ollama parser.
 */
export class OpenAiStreamParser {
  private buffer = "";
  private done = false;

  push(chunk: string): string {
    this.buffer += chunk;
    let out = "";
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      out += this.consumeLine(line);
      newline = this.buffer.indexOf("\n");
    }
    return out;
  }

  finish(): string {
    const rest = this.buffer;
    this.buffer = "";
    return rest.trim() ? this.consumeLine(rest) : "";
  }

  private consumeLine(rawLine: string): string {
    // `\r\n` is legal in SSE and some servers send it.
    const line = rawLine.replace(/\r$/, "").trim();
    if (!line) return "";
    // A comment line is the keep-alive heartbeat. Not data.
    if (line.startsWith(":")) return "";
    if (!line.startsWith("data:")) return "";

    const data = line.slice("data:".length).trim();
    if (data === "[DONE]") {
      this.done = true;
      return "";
    }

    let payload: {
      choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown } }>;
      error?: { message?: string } | string;
    };
    try {
      payload = JSON.parse(data);
    } catch {
      // Same reasoning as the Ollama parser: drop, do not throw.
      return "";
    }

    if (payload.error) {
      const message =
        typeof payload.error === "string" ? payload.error : (payload.error.message ?? "unknown");
      throw new Error(`OpenAI-compatible: ${message}`);
    }

    const choice = payload.choices?.[0];
    // `delta.content` while streaming; `message.content` if a server answers a
    // stream request with one complete frame, which some proxies do.
    const content = choice?.delta?.content ?? choice?.message?.content;
    return typeof content === "string" ? content : "";
  }

  get isDone(): boolean {
    return this.done;
  }
}

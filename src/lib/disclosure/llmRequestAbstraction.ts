import { buildRequestAbstraction, type RequestAbstraction } from "./requestAbstraction";

/**
 * Local-LLM-backed request abstraction. Asks the user's local model
 * (Ollama) to turn a raw request into a privacy-safe summary + a
 * content-free intent line, and falls back to the deterministic
 * `buildRequestAbstraction` on any failure (no fetch, network error, bad
 * JSON, empty fields). The deterministic helper stays the always-available
 * floor, mirroring the Quick Pass provider contract.
 *
 * This is the richer producer for the `abstract` / `summary` variants the
 * disclosure layer renders. It is async (a model call), so callers
 * precompute and store the result rather than invoking it at render time.
 *
 * See `docs/design/local-llm-understanding-and-live-follow.md` (slice 5).
 */
export type LlmRequestAbstractionConfig = {
  endpoint: string;
  model: string;
  timeoutMs?: number;
};

export type LlmRequestAbstractionDeps = {
  fetchImpl?: typeof fetch;
};

export type LlmRequestAbstractionResult = RequestAbstraction & {
  /** Where the result came from, so callers can be honest about it. */
  source: "llm" | "deterministic";
  /** Why the deterministic floor was used, when it was. */
  note?: string;
};

const SYSTEM_PROMPT = [
  "You convert a user's coding request into a privacy-safe description.",
  'Respond ONLY with a JSON object: {"summary": string, "abstract": string}.',
  "summary: one short Korean sentence capturing the gist of the request.",
  "abstract: a Korean intent line stating only the KIND of request",
  "(for example '사용자가 구현 작업을 요청함'). The abstract MUST NOT contain file",
  "names, identifiers, secrets, URLs, or any specific detail. No extra text.",
].join(" ");

export async function buildLlmRequestAbstraction(
  rawText: string,
  config: LlmRequestAbstractionConfig,
  deps: LlmRequestAbstractionDeps = {},
): Promise<LlmRequestAbstractionResult> {
  const deterministic = buildRequestAbstraction(rawText);
  const normalized = rawText.trim();
  if (!normalized) return { ...deterministic, source: "deterministic" };

  const fetchImpl = deps.fetchImpl ?? globalFetch();
  if (!fetchImpl) {
    return { ...deterministic, source: "deterministic", note: "이 런타임에서 fetch를 사용할 수 없습니다." };
  }

  try {
    const responseText = await callOllamaGenerate(fetchImpl, config, normalized);
    const parsed = parseAbstractionJson(responseText);
    const abstract = nonEmpty(parsed.abstract);
    const summary = nonEmpty(parsed.summary) ?? deterministic.summary;
    if (!abstract) {
      return {
        summary,
        abstract: deterministic.abstract,
        source: "deterministic",
        note: "LLM 응답에 요지가 없어 기본값을 사용했습니다.",
      };
    }
    return { summary, abstract, source: "llm" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return { ...deterministic, source: "deterministic", note: message };
  }
}

async function callOllamaGenerate(
  fetchImpl: typeof fetch,
  config: LlmRequestAbstractionConfig,
  userPrompt: string,
): Promise<string> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000)
    : null;
  try {
    const response = await fetchImpl(`${stripTrailingSlash(config.endpoint)}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller?.signal,
      body: JSON.stringify({
        model: config.model,
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        stream: false,
        format: "json",
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama 요청이 HTTP ${response.status}로 실패했습니다.`);
    }
    const payload = (await response.json()) as { response?: string };
    if (typeof payload.response !== "string") {
      throw new Error("Ollama 응답에 'response' 문자열이 없습니다.");
    }
    return payload.response;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type ParsedAbstraction = { summary?: unknown; abstract?: unknown };

export function parseAbstractionJson(rawText: string): { summary?: string; abstract?: string } {
  const json = extractJson(rawText);
  if (!json || typeof json !== "object") {
    throw new Error("LLM 추상화 응답이 JSON 객체가 아닙니다.");
  }
  const candidate = json as ParsedAbstraction;
  return {
    summary: typeof candidate.summary === "string" ? candidate.summary : undefined,
    abstract: typeof candidate.abstract === "string" ? candidate.abstract : undefined,
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function globalFetch(): typeof fetch | null {
  return typeof fetch === "function" ? fetch.bind(globalThis) : null;
}

import type { Decision, Issue, NextAction, Priority, Relationship, TrustLevel } from "../../domain/types";
import { createRunId } from "./analysisMapper";
import type {
  AnalysisSummary,
  AnalysisInput,
  AnalysisProvider,
  AnalysisResult,
} from "./analysisTypes";
import { buildQuickPassPromptChunks } from "./promptTemplates";

const PROVIDER_NAME = "ollama-quick-pass-v1" as const;

export type OllamaProviderConfig = {
  endpoint: string;
  model: string;
  timeoutMs?: number;
  label?: string;
  fetchImpl?: typeof fetch;
};

export class OllamaQuickPassProvider implements AnalysisProvider {
  readonly name = PROVIDER_NAME;
  readonly label: string;
  readonly requiresNetwork = true;

  constructor(private readonly config: OllamaProviderConfig) {
    this.label = config.label ?? `Ollama Quick Pass (${config.model})`;
  }

  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const startedAt = Date.now();
    const generatedAt = input.now ?? new Date().toISOString();
    const runId = createRunId(input, generatedAt);
    const profile = getOllamaModelProfile(this.config.model);
    const chunks = buildQuickPassPromptChunks(input, {
      maxEventsPerChunk: profile.maxEventsPerChunk,
      eventDigestBudgetChars: profile.eventDigestBudgetChars,
      sourceDigestBudgetChars: profile.sourceDigestBudgetChars,
    });

    const parsedChunks: ParsedQuickPass[] = [];
    const chunkErrors: string[] = [];
    for (const chunk of chunks) {
      try {
        const responseText = await this.callOllama(chunk.systemPrompt, chunk.userPrompt, profile);
        parsedChunks.push(parseOllamaQuickPassJson(responseText));
      } catch (error) {
        // One bad chunk (e.g. an output that still overran the token ceiling, or
        // a malformed JSON reply) must not sink the whole run — record it and
        // keep the findings from the chunks that succeeded.
        chunkErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
    // Only when EVERY chunk failed do we surface the failure, so the run falls
    // to the honest "분석 실패" path rather than a misleading empty success.
    if (parsedChunks.length === 0) {
      throw new Error(chunkErrors[0] ?? "Ollama Quick Pass produced no usable output.");
    }
    const parsed = mergeParsedQuickPassChunks(parsedChunks);

    const issues: Issue[] = parsed.issues.map((candidate, index) => ({
      id: `issue-${runId}-${index + 1}`,
      projectId: input.project.id,
      sessionId: input.session.id,
      title: candidate.title,
      description: candidate.description ?? "",
      status: candidate.status ?? "open",
      priority: coercePriority(candidate.priority),
      sourceEventIds: candidate.sourceEventIds ?? [],
      relatedDecisionIds: [],
      relatedFileIds: [],
      suggestedNextAction: candidate.suggestedNextAction ?? `Resolve: ${candidate.title}`,
      assignee: candidate.assignee,
      dueDate: candidate.dueDate,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      confidence: clampNumber(candidate.confidence ?? 0.6, 0, 1),
      trustLevel: coerceTrust(candidate.trustLevel),
    }));

    const decisions: Decision[] = parsed.decisions.map((candidate, index) => ({
      id: `decision-${runId}-${index + 1}`,
      projectId: input.project.id,
      sessionId: input.session.id,
      title: candidate.title,
      decision: candidate.decision ?? candidate.title,
      rationale: candidate.rationale ?? "",
      rejectedOptions: candidate.rejectedOptions ?? [],
      impact: candidate.impact ?? [],
      sourceEventIds: candidate.sourceEventIds ?? [],
      relatedIssueIds: [],
      relatedSourceIds: [],
      createdAt: generatedAt,
      importance: coercePriority(candidate.importance),
      trustLevel: coerceTrust(candidate.trustLevel),
      confirmed: Boolean(candidate.confirmed),
    }));

    const relationships: Relationship[] = (parsed.relationships ?? []).map((candidate, index) => ({
      id: `rel-${runId}-${index + 1}`,
      fromId: candidate.fromId,
      fromType: candidate.fromType,
      toId: candidate.toId,
      toType: candidate.toType,
      type: candidate.type,
      confidence: clampNumber(candidate.confidence ?? 0.5, 0, 1),
      reason: candidate.reason ?? "Ollama Quick Pass output",
    }));

    const nextActions: NextAction[] = (parsed.nextActions ?? []).map((candidate, index) => ({
      id: `nact-${runId}-${index + 1}`,
      sessionId: input.session.id,
      title: candidate.title,
      priority: coercePriority(candidate.priority),
      relatedIssueIds: candidate.relatedIssueIds ?? [],
      relatedEventIds: candidate.relatedEventIds ?? [],
    }));

    const summary: AnalysisSummary = {
      sessionSummary: parsed.summary?.sessionSummary ?? "",
      resumePrompt: parsed.summary?.resumePrompt ?? "",
      highlights: parsed.summary?.highlights ?? [],
    };

    return {
      runId,
      providerName: PROVIDER_NAME,
      providerLabel: this.label,
      sessionId: input.session.id,
      projectId: input.project.id,
      generatedAt,
      durationMs: Date.now() - startedAt,
      inputEventCount: input.events.length,
      inputSourceCount: input.sources.length,
      summary,
      issues,
      decisions,
      relationships,
      nextActions,
      rendered: {
        summary: {
          id: `summary-${runId}`,
          sessionId: input.session.id,
          sessionSummary: summary.sessionSummary,
          resumePrompt: summary.resumePrompt,
          reportMarkdown: "",
          nextActionIds: nextActions.map((action) => action.id),
          generatedAt,
        },
      },
      confidence: 0.75,
      notes: [
        `Generated by ${this.label} against ${this.config.endpoint}`,
        chunks.length > 1
          ? `Chunked local analysis: ${chunks.length} passes using ${profile.label}.`
          : `Local analysis profile: ${profile.label}.`,
        ...(chunkErrors.length > 0
          ? [
              `${chunks.length}개 중 ${chunkErrors.length}개 청크를 건너뛴 부분 결과입니다 (예: 출력 길이 초과). 더 작은 모델 프로파일이나 더 짧은 세션으로 다시 시도하면 완전해집니다.`,
            ]
          : []),
      ],
    };
  }

  private async callOllama(
    systemPrompt: string,
    userPrompt: string,
    profile: OllamaModelProfile,
  ): Promise<string> {
    const fetchImpl = this.config.fetchImpl ?? globalFetch();
    if (!fetchImpl) {
      throw new Error("Ollama provider requires fetch; none is available in this runtime.");
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutMs = this.config.timeoutMs ?? 60_000;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      const response = await fetchImpl(`${stripTrailingSlash(this.config.endpoint)}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller?.signal,
        body: JSON.stringify({
          model: this.config.model,
          system: systemPrompt,
          prompt: userPrompt,
          stream: false,
          format: "json",
          options: {
            temperature: 0,
            num_ctx: profile.numCtx,
            num_predict: profile.numPredict,
          },
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        throw new Error(describeOllamaFailure(response.status, bodyText));
      }

      const payload = (await response.json()) as {
        response?: string;
        done_reason?: string;
      };
      if (typeof payload.response !== "string") {
        throw new Error("Ollama response missing 'response' string field");
      }
      if (payload.done_reason === "length") {
        throw new Error(
          "Ollama response was truncated before Quick Pass JSON finished. Mori already split the session into smaller chunks; try a smaller model profile, a model with a larger context window, or increase the Ollama timeout.",
        );
      }
      return payload.response;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export function createOllamaQuickPassProvider(config: OllamaProviderConfig): OllamaQuickPassProvider {
  return new OllamaQuickPassProvider(config);
}

/** Per-model metadata from `/api/tags`, used to make the picker informative. */
export type OllamaModelInfo = {
  name: string;
  /** On-disk size in bytes, when reported. */
  sizeBytes?: number;
  /** Human parameter count (e.g. "8.2B"), when reported. */
  parameterSize?: string;
};

export type OllamaConnectionProbe = {
  ok: boolean;
  message: string;
  models?: string[];
  modelInfo?: OllamaModelInfo[];
};

export async function probeOllamaConnection(
  config: Pick<OllamaProviderConfig, "endpoint" | "timeoutMs" | "fetchImpl">,
): Promise<OllamaConnectionProbe> {
  const fetchImpl = config.fetchImpl ?? (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  if (!fetchImpl) {
    return { ok: false, message: "No fetch implementation available in this runtime." };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), config.timeoutMs ?? 5_000) : null;
  try {
    const response = await fetchImpl(`${stripTrailingSlash(config.endpoint)}/api/tags`, {
      method: "GET",
      signal: controller?.signal,
    });
    if (!response.ok) {
      return { ok: false, message: `Ollama responded with HTTP ${response.status}` };
    }
    const payload = (await response.json()) as {
      models?: Array<{ name?: string; size?: number; details?: { parameter_size?: string } }>;
    };
    const modelInfo: OllamaModelInfo[] = Array.isArray(payload.models)
      ? payload.models
          .filter((entry): entry is { name: string; size?: number; details?: { parameter_size?: string } } =>
            typeof entry.name === "string" && entry.name.length > 0,
          )
          .map((entry) => ({
            name: entry.name,
            sizeBytes: typeof entry.size === "number" ? entry.size : undefined,
            parameterSize:
              typeof entry.details?.parameter_size === "string" ? entry.details.parameter_size : undefined,
          }))
      : [];
    const models = modelInfo.map((entry) => entry.name);
    return { ok: true, message: `Reachable (${models.length} models)`, models, modelInfo };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type ParsedQuickPass = {
  summary?: Partial<AnalysisSummary>;
  issues: Array<{
    title: string;
    description?: string;
    status?: Issue["status"];
    priority?: string;
    sourceEventIds?: string[];
    suggestedNextAction?: string;
    confidence?: number;
    trustLevel?: string;
    assignee?: string;
    dueDate?: string;
  }>;
  decisions: Array<{
    title: string;
    decision?: string;
    rationale?: string;
    rejectedOptions?: string[];
    impact?: string[];
    sourceEventIds?: string[];
    importance?: string;
    trustLevel?: string;
    confirmed?: boolean;
  }>;
  relationships?: Array<{
    fromId: string;
    fromType: Relationship["fromType"];
    toId: string;
    toType: Relationship["toType"];
    type: Relationship["type"];
    confidence?: number;
    reason?: string;
  }>;
  nextActions?: Array<{
    title: string;
    priority?: string;
    relatedIssueIds?: string[];
    relatedEventIds?: string[];
  }>;
};

type OllamaModelProfile = {
  label: string;
  maxEventsPerChunk: number;
  eventDigestBudgetChars: number;
  sourceDigestBudgetChars: number;
  numCtx: number;
  numPredict: number;
};

// `numPredict` is the OUTPUT token ceiling, not a target — the model stops once
// the JSON is complete, so a generous ceiling only prevents truncation
// (`done_reason: "length"`) and never pads or slows a short answer. The earlier
// 900–1600 ceilings were below a real chunk's JSON: a 12-issue extraction
// already needs ~1180 tokens (measured on gemma e4b). `numCtx` is sized to fit
// the chunk's input digest plus that output ceiling. `numCtx` 8192 was verified
// to load and run at full GPU speed on an 8 GB card, so the bump is memory-safe.
function getOllamaModelProfile(model: string): OllamaModelProfile {
  const billions = inferModelBillions(model);
  if (billions !== null && billions <= 2) {
    return {
      label: "tiny local model",
      maxEventsPerChunk: 18,
      eventDigestBudgetChars: 4_800,
      sourceDigestBudgetChars: 1_000,
      numCtx: 6_144,
      numPredict: 3_072,
    };
  }
  if (billions !== null && billions <= 4.5) {
    return {
      label: "small local model",
      maxEventsPerChunk: 28,
      eventDigestBudgetChars: 6_400,
      sourceDigestBudgetChars: 1_200,
      numCtx: 8_192,
      numPredict: 4_096,
    };
  }
  if (billions !== null && billions >= 14) {
    return {
      label: "large local model",
      maxEventsPerChunk: 64,
      eventDigestBudgetChars: 12_000,
      sourceDigestBudgetChars: 1_800,
      numCtx: 12_288,
      numPredict: 5_120,
    };
  }
  return {
    label: "standard local model",
    maxEventsPerChunk: 44,
    eventDigestBudgetChars: 8_800,
    sourceDigestBudgetChars: 1_600,
    numCtx: 8_192,
    numPredict: 4_096,
  };
}

function inferModelBillions(model: string): number | null {
  const normalized = model.toLowerCase();
  const explicit = normalized.match(/(?:^|[:\-_])e?(\d+(?:\.\d+)?)b(?:$|[:\-_])/);
  if (explicit?.[1]) return Number(explicit[1]);
  const compact = normalized.match(/(?:^|[:\-_])(\d+)(?:\.\d+)?b/);
  if (compact?.[1]) return Number(compact[1]);
  if (/\bmini\b|\btiny\b/.test(normalized)) return 2;
  return null;
}

function mergeParsedQuickPassChunks(chunks: ParsedQuickPass[]): ParsedQuickPass {
  if (chunks.length === 1) return chunks[0]!;
  const summaries = chunks.map((chunk) => chunk.summary).filter(Boolean);
  const highlights = uniqueStrings(
    summaries.flatMap((summary) => summary?.highlights ?? []),
  ).slice(0, 10);
  const sessionSummaries = uniqueStrings(
    summaries
      .map((summary) => summary?.sessionSummary?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  const resumePrompts = uniqueStrings(
    summaries
      .map((summary) => summary?.resumePrompt?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  return {
    summary: {
      sessionSummary: sessionSummaries.slice(0, 4).join(" / "),
      resumePrompt: resumePrompts.slice(0, 4).join("\n\n"),
      highlights,
    },
    issues: mergeTitledItems(chunks.flatMap((chunk) => chunk.issues)).slice(0, 24),
    decisions: mergeTitledItems(chunks.flatMap((chunk) => chunk.decisions)).slice(0, 24),
    relationships: mergeRelationships(chunks.flatMap((chunk) => chunk.relationships ?? [])).slice(0, 48),
    nextActions: mergeTitledItems(chunks.flatMap((chunk) => chunk.nextActions ?? [])).slice(0, 24),
  };
}

function mergeTitledItems<T extends { title: string }>(items: T[]): T[] {
  const byTitle = new Map<string, T>();
  for (const item of items) {
    const key = item.title.trim().toLowerCase();
    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, { ...item });
      continue;
    }
    mergeStringArrayField(existing, item, "sourceEventIds");
    mergeStringArrayField(existing, item, "relatedEventIds");
    mergeStringArrayField(existing, item, "relatedIssueIds");
  }
  return Array.from(byTitle.values());
}

function mergeStringArrayField<T extends object>(target: T, source: T, key: string): void {
  const left = (target as Record<string, unknown>)[key];
  const right = (source as Record<string, unknown>)[key];
  if (!Array.isArray(left) && !Array.isArray(right)) return;
  const values = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]
    .filter((value): value is string => typeof value === "string");
  (target as Record<string, unknown>)[key] = uniqueStrings(values);
}

function mergeRelationships(
  relationships: NonNullable<ParsedQuickPass["relationships"]>,
): NonNullable<ParsedQuickPass["relationships"]> {
  const byKey = new Map<string, NonNullable<ParsedQuickPass["relationships"]>[number]>();
  for (const relationship of relationships) {
    const key = `${relationship.fromType}:${relationship.fromId}:${relationship.type}:${relationship.toType}:${relationship.toId}`;
    if (!byKey.has(key)) byKey.set(key, relationship);
  }
  return Array.from(byKey.values());
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function parseOllamaQuickPassJson(rawText: string): ParsedQuickPass {
  const json = extractJson(rawText);
  if (!json) {
    throw new Error("Ollama Quick Pass response is not a JSON object");
  }

  // Sanitize at the parse boundary so a weak model's noise (title-less items,
  // duplicates, half-formed relationships) never reaches the review board. This
  // is a model-independent quality floor: the same garbage from any engine is
  // dropped identically here.
  const candidate = json as Partial<ParsedQuickPass>;
  return {
    summary: candidate.summary,
    issues: keepTitled<ParsedQuickPass["issues"][number]>(candidate.issues),
    decisions: keepTitled<ParsedQuickPass["decisions"][number]>(candidate.decisions),
    relationships: keepRelationships(candidate.relationships),
    nextActions: keepTitled<NonNullable<ParsedQuickPass["nextActions"]>[number]>(
      candidate.nextActions,
    ),
  };
}

/**
 * Keep only array items with a usable non-empty title, deduped by normalized
 * title (first occurrence wins). Drops the empty / whitespace / repeated items a
 * weak model commonly emits, so they never become blank or duplicate cards.
 */
function keepTitled<T extends { title: string }>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const title = (item as { title?: unknown }).title;
    if (typeof title !== "string" || title.trim().length === 0) continue;
    const key = title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item as T);
  }
  return out;
}

/** Keep only relationships that name both endpoints and a type. */
function keepRelationships(value: unknown): ParsedQuickPass["relationships"] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is NonNullable<ParsedQuickPass["relationships"]>[number] =>
      !!item &&
      typeof item === "object" &&
      typeof (item as { fromId?: unknown }).fromId === "string" &&
      typeof (item as { toId?: unknown }).toId === "string" &&
      typeof (item as { type?: unknown }).type === "string",
  );
}

/**
 * Pull a JSON object out of a local model's reply. Small local models rarely
 * return clean JSON: they wrap it in a ```json code fence, prepend a
 * <think> reasoning block, add prose around it, or leave a trailing comma. This
 * tries increasingly forgiving strategies so a usable object survives all of
 * those, instead of failing the whole run on a cosmetic wrapper. Returns the
 * parsed object, or `null` when no object can be recovered.
 */
function extractJson(text: string): Record<string, unknown> | null {
  // Drop <think>...</think> reasoning some models emit before the answer.
  const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/gi, "");

  const candidates: string[] = [];
  // Prefer the contents of a fenced code block when present.
  const fence = withoutThink.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1]);
  // The whole de-fenced reply.
  candidates.push(withoutThink);
  // The first balanced { ... } span, string-aware so braces inside strings or
  // trailing prose never truncate or over-extend the object.
  const balanced = firstBalancedObject(withoutThink);
  if (balanced) candidates.push(balanced);

  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function tryParseObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Second attempt tolerates a trailing comma before } or ], a common small-
  // model slip that is otherwise valid JSON.
  for (const attempt of [trimmed, trimmed.replace(/,(\s*[}\]])/g, "$1")]) {
    try {
      const value = JSON.parse(attempt);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch {
      // Fall through to the next, more forgiving attempt.
    }
  }
  return null;
}

/** The first brace-balanced object substring, ignoring braces inside strings. */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function coercePriority(value: string | undefined): Priority {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function coerceTrust(value: string | undefined): TrustLevel {
  if (value === "verified" || value === "observed" || value === "inferred") return value;
  return "inferred";
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Turn a non-OK Ollama response into an informative, actionable error.
 * Ollama returns its real reason in the body (`{"error":"…"}`) which Mori
 * otherwise hides behind "HTTP 500". For memory / allocation failures, add a
 * Korean hint that the model is likely too large for the machine.
 */
export function describeOllamaFailure(status: number, bodyText: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(bodyText) as { error?: unknown };
    if (typeof parsed.error === "string") detail = parsed.error.trim();
  } catch {
    detail = bodyText.trim().slice(0, 200);
  }
  const base = detail ? `Ollama: ${detail}` : `Ollama 요청 실패 (HTTP ${status})`;
  if (/memory|alloc|out of memory|\boom\b|cuda/i.test(detail)) {
    return `${base} · 모델이 이 기기 메모리에 비해 클 수 있어요. 더 작은 모델(예: gemma3:1b, qwen2.5:1.5b)로 바꾸거나 메모리를 확보한 뒤 다시 시도하세요.`;
  }
  return base;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function globalFetch(): typeof fetch | null {
  if (typeof fetch === "function") return fetch.bind(globalThis);
  return null;
}

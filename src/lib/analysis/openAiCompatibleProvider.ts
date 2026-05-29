import type { Decision, Issue, NextAction, Priority, Relationship, TrustLevel } from "../../domain/types";
import { createRunId } from "./analysisMapper";
import type {
  AnalysisInput,
  AnalysisProvider,
  AnalysisResult,
  AnalysisSummary,
} from "./analysisTypes";
import { parseOllamaQuickPassJson } from "./ollamaProvider";
import { buildQuickPassPrompt } from "./promptTemplates";

const PROVIDER_NAME = "openai-compatible-quick-pass-v1" as const;

export type OpenAiCompatibleProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  label?: string;
  fetchImpl?: typeof fetch;
};

type OpenAiCompatibleParsedQuickPass = ReturnType<typeof parseOllamaQuickPassJson>;

export class OpenAiCompatibleQuickPassProvider implements AnalysisProvider {
  readonly name = PROVIDER_NAME;
  readonly label: string;
  readonly requiresNetwork = true;

  constructor(private readonly config: OpenAiCompatibleProviderConfig) {
    this.label = config.label ?? `OpenAI-compatible Quick Pass (${config.model})`;
  }

  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const startedAt = Date.now();
    const generatedAt = input.now ?? new Date().toISOString();
    const runId = createRunId(input, generatedAt);
    const { systemPrompt, userPrompt } = buildQuickPassPrompt(input);

    const responseText = await this.callChatCompletions(systemPrompt, userPrompt);
    const parsed = parseOllamaQuickPassJson(responseText);

    return buildOpenAiCompatibleResult({
      input,
      parsed,
      runId,
      generatedAt,
      durationMs: Date.now() - startedAt,
      providerLabel: this.label,
      baseUrl: this.config.baseUrl,
    });
  }

  private async callChatCompletions(systemPrompt: string, userPrompt: string): Promise<string> {
    const fetchImpl = this.config.fetchImpl ?? globalFetch();
    if (!fetchImpl) {
      throw new Error("OpenAI-compatible provider requires fetch; none is available in this runtime.");
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutMs = this.config.timeoutMs ?? 60_000;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.config.apiKey?.trim()) {
        headers.Authorization = `Bearer ${this.config.apiKey.trim()}`;
      }

      const response = await fetchImpl(
        `${stripTrailingSlash(this.config.baseUrl)}/chat/completions`,
        {
          method: "POST",
          headers,
          signal: controller?.signal,
          body: JSON.stringify({
            model: this.config.model,
            temperature: 0.2,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`OpenAI-compatible request failed with HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const joined = content.map((part) => part.text).filter(Boolean).join("\n");
        if (joined) return joined;
      }
      throw new Error("OpenAI-compatible response missing choices[0].message.content");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export function createOpenAiCompatibleQuickPassProvider(
  config: OpenAiCompatibleProviderConfig,
): OpenAiCompatibleQuickPassProvider {
  return new OpenAiCompatibleQuickPassProvider(config);
}

export type OpenAiCompatibleConnectionProbe = {
  ok: boolean;
  message: string;
  models?: string[];
};

export async function probeOpenAiCompatibleConnection(
  config: Pick<
    OpenAiCompatibleProviderConfig,
    "baseUrl" | "apiKey" | "timeoutMs" | "fetchImpl"
  >,
): Promise<OpenAiCompatibleConnectionProbe> {
  const fetchImpl = config.fetchImpl ?? globalFetch();
  if (!fetchImpl) {
    return { ok: false, message: "No fetch implementation available in this runtime." };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), config.timeoutMs ?? 5_000) : null;
  try {
    const headers: Record<string, string> = {};
    if (config.apiKey?.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    const response = await fetchImpl(`${stripTrailingSlash(config.baseUrl)}/models`, {
      method: "GET",
      headers,
      signal: controller?.signal,
    });
    if (!response.ok) {
      return { ok: false, message: `OpenAI-compatible endpoint responded with HTTP ${response.status}` };
    }
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = Array.isArray(payload.data)
      ? payload.data.map((entry) => entry.id).filter((id): id is string => Boolean(id))
      : [];
    return { ok: true, message: `Reachable (${models.length} models)`, models };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildOpenAiCompatibleResult({
  input,
  parsed,
  runId,
  generatedAt,
  durationMs,
  providerLabel,
  baseUrl,
}: {
  input: AnalysisInput;
  parsed: OpenAiCompatibleParsedQuickPass;
  runId: string;
  generatedAt: string;
  durationMs: number;
  providerLabel: string;
  baseUrl: string;
}): AnalysisResult {
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
    reason: candidate.reason ?? "OpenAI-compatible Quick Pass output",
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
    providerLabel,
    sessionId: input.session.id,
    projectId: input.project.id,
    generatedAt,
    durationMs,
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
    notes: [`Generated by ${providerLabel} against ${baseUrl}`],
  };
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

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function globalFetch(): typeof fetch | null {
  if (typeof fetch === "function") return fetch.bind(globalThis);
  return null;
}

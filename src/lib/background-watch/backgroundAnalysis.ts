/**
 * Headless connector import + analysis pipeline.
 *
 * Runs entirely off the active draft: reads an inbox JSONL file, parses it,
 * produces a minimal synthetic project + session context, and runs the
 * requested analysis provider against the events. Returns the raw result plus
 * the source metadata — callers feed this into the notification feed and let
 * the user review and apply (or discard) before anything touches storage.
 *
 * This is the "AI runs in the background" half of the watch feature: the
 * detection half (inboxWatch.ts) finds new files; this pipeline is what
 * analyses them. Neither half writes to memory on its own.
 */
import {
  buildConnectorJsonlPreview,
  normalizeConnectorEventBatch,
} from "../connectors";
import type { TimelineEvent, SourceRef } from "../../domain/types";
import type { AnalysisResult } from "../analysis/analysisTypes";
import type { AnalysisProvider } from "../analysis/analysisTypes";
import { createSessionDraft } from "../session/createSessionDraft";

export type BackgroundAnalysisInput = {
  /** Absolute path — used as the source label. */
  path: string;
  /** Raw JSONL text from `readConnectorJsonlFile`. */
  text: string;
  /** Resolved provider to run (the caller holds the settings). */
  provider: AnalysisProvider;
  /** Optional project name for the synthetic context (defaults to the filename). */
  projectLabel?: string;
};

export type BackgroundAnalysisResult = {
  path: string;
  /** Parsed events that were analysed (may be a subset when duplicates were skipped). */
  eventCount: number;
  /** The analysis result — identical shape to what a manual Quick Pass produces. */
  analysis: AnalysisResult;
  /** ISO timestamp when this result was produced. */
  producedAt: string;
  /** Synthetic session id the analysis is bound to. */
  sessionId: string;
};

export type BackgroundAnalysisError = {
  path: string;
  reason: "parse-failed" | "no-events" | "analysis-failed";
  message: string;
};

export type BackgroundAnalysisOutcome =
  | { ok: true; result: BackgroundAnalysisResult }
  | { ok: false; error: BackgroundAnalysisError };

/**
 * Run the headless import + analysis pipeline for one inbox file. Pure async —
 * no side effects on any store, no storage writes. The caller decides what to
 * do with the outcome.
 */
export async function runBackgroundAnalysis(
  input: BackgroundAnalysisInput,
  now = new Date().toISOString(),
): Promise<BackgroundAnalysisOutcome> {
  const { path, text, provider, projectLabel } = input;

  const preview = buildConnectorJsonlPreview(text);
  if (preview.kind === "empty" || preview.kind === "errors-only") {
    return {
      ok: false,
      error: { path, reason: "parse-failed", message: preview.headline },
    };
  }

  const events = preview.newEvents.length > 0 ? preview.newEvents : preview.events;
  if (events.length === 0) {
    return {
      ok: false,
      error: { path, reason: "no-events", message: "유효한 이벤트가 없습니다." },
    };
  }

  const label = projectLabel ?? basename(path);

  // Synthetic session — a lightweight context that makes the analysis input
  // shape well-formed without requiring the user to have an active draft.
  const { session, project } = createSessionDraft({
    sessionTitle: label,
    projectName: label,
    selectedSources: [],
    recordingMode: "full",
    llmProvider: "ollama",
    llmModel: "",
    storageLocation: "browser:localStorage",
    now,
    status: "complete",
  });

  // Normalize into a single candidate, then flatten back to events + sources
  // in the AnalysisInput shape. The normalizer assigns real ids and dedupes
  // within the batch.
  const candidates = normalizeConnectorEventBatch({
    projectId: project.id,
    sessionId: session.id,
    events,
  });

  const analysisEvents: TimelineEvent[] = candidates.flatMap((bucket) => bucket.events);
  const analysisSources: SourceRef[] = candidates.map((bucket) => bucket.source);

  if (analysisEvents.length === 0) {
    return {
      ok: false,
      error: { path, reason: "no-events", message: "정규화 후 이벤트가 없습니다." },
    };
  }

  try {
    const analysis = await provider.analyze({
      project,
      session,
      sources: analysisSources,
      events: analysisEvents,
    });
    return {
      ok: true,
      result: {
        path,
        eventCount: analysisEvents.length,
        analysis,
        producedAt: now,
        sessionId: session.id,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        path,
        reason: "analysis-failed",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

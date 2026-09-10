/**
 * Trace core types.
 *
 * Trace is the evidence layer: it records observable activity over time.
 * Interpretation, memory formation, Flow / Episode construction, and recall
 * stay outside this package.
 */

export type TraceSourceKind =
  | "ai"
  | "browser"
  | "desktop"
  | "dev"
  | "terminal"
  | "files"
  | "os"
  | "mobile"
  | (string & {});

export type TraceSourceDescriptor = {
  id: string;
  kind: TraceSourceKind;
  label: string;
  /** Stable provider / tool identifier, e.g. claude, codex, chrome. */
  provider?: string;
  /** Human-facing scope label such as a project, profile, device, or workspace. */
  scopeLabel?: string;
};

export type TraceMetadata = Record<string, unknown>;

export type TraceEvent<TMetadata extends TraceMetadata = TraceMetadata> = {
  id: string;
  source: TraceSourceDescriptor;
  /** Stable event kind within the source family, e.g. session_discovered. */
  kind: string;
  occurredAt: string;
  title: string;
  summary?: string;
  confidence: number;
  metadata: TMetadata;
};

export type TraceSpan<TMetadata extends TraceMetadata = TraceMetadata> = {
  id: string;
  source: TraceSourceDescriptor;
  kind: string;
  start: string;
  end?: string;
  title: string;
  summary?: string;
  eventIds: string[];
  metadata: TMetadata;
};

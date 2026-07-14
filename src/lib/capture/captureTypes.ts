/**
 * Capture · types for the pipeline that turns a raw trace into records
 * (architecture doc §4-§5).
 *
 * The load-bearing distinction: a `CaptureInput` produces exactly one
 * `KernelSource` (the raw trace, preserved immediately and losslessly) plus
 * zero or more `RecordProposal`s (the interpretation, each with its own
 * confidence and apply decision). Raw capture never waits; interpretation is
 * governed.
 */
import type {
  KernelSource,
  RecordPropertyValue,
  SourceKind,
  TimeBasis,
} from "../record-kernel/kernelTypes";

/** What the user handed to Mori. Kind mirrors the pilot capture channels
 *  plus `agent-session` for a converted agent work session. */
export type CaptureInput = {
  kind: Extract<SourceKind, "text" | "url" | "pasted-conversation" | "agent-session">;
  /** The raw text, URL, or pasted body exactly as provided. */
  content: string;
  /** Present for `url` captures; the address itself. */
  url?: string;
  /** A generic origin locator for the source (e.g. an agent session id). */
  locator?: string;
  /** When the user says the activity happened, if they said. */
  occurredHint?: string;
};

/** A proposed record derived from a capture, before the apply decision. */
export type RecordProposal = {
  schemaId: string;
  title: string;
  body: string;
  properties: Record<string, RecordPropertyValue>;
  occurredStart?: string;
  timeBasis: TimeBasis;
  /** 0..1 confidence in the activity time, when it was inferred. */
  timeConfidence?: number;
  /** 0..1 confidence in this interpretation (not in the raw text). */
  confidence: number;
  /** Human-readable one-liner of why this schema was chosen. */
  rationale: string;
  /** Entities this proposal references by canonical name; resolved later. */
  entityMentions: EntityMention[];
  /** True when the interpretation introduces an entity Mori has not seen. */
  introducesNewEntity?: boolean;
};

export type EntityMention = {
  type: string;
  canonicalName: string;
};

/** The full result of parsing + understanding + proposing over one input. */
export type CaptureProposalSet = {
  source: KernelSource;
  proposals: RecordProposal[];
  /** True when the raw content tripped secret detection. */
  sensitive: boolean;
};

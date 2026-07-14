/**
 * Capture pipeline · orchestrates the stages for one input
 * (architecture doc §4): preserve the raw source, propose records, decide
 * each proposal's apply outcome, and build the records + revisions + source
 * links to persist.
 *
 * Pure and IO-free: it returns a `CaptureOutcome` describing what to write.
 * The caller (a hook / store action) persists through `KernelRepository`, so
 * this stays unit-testable without a database and the invariant "raw source
 * is always preserved" is visible in one place.
 */
import {
  createKernelId,
  createRecord,
  type CreatedRecord,
} from "../record-kernel/recordFactory";
import type { SchemaRegistry } from "../record-kernel/schemaRegistry";
import type {
  KernelSource,
  RecordOrigin,
  SourceLink,
} from "../record-kernel/kernelTypes";
import { containsLikelySecret } from "../connectors/redaction";
import {
  evaluateApply,
  statusForDecision,
  type ApplyDecision,
  type AutomationLevel,
} from "./applyPolicy";
import type { CaptureInput, RecordProposal } from "./captureTypes";
import { proposeRecords, type ProposerOptions } from "./ruleBasedProposer";

/** One proposed record resolved to a concrete apply decision + built record. */
export type CaptureRecordOutcome = {
  created: CreatedRecord;
  sourceLink: SourceLink;
  decision: ApplyDecision;
  reason: string;
  confidence: number;
};

export type CaptureOutcome = {
  /** The raw trace, preserved regardless of any apply decision. */
  source: KernelSource;
  sensitive: boolean;
  records: CaptureRecordOutcome[];
};

export type CapturePipelineOptions = ProposerOptions & {
  /** Per-schema automation level; defaults to `auto` for unlisted schemas. */
  automationForSchema?: (schemaId: string) => AutomationLevel;
  /** Swap the proposer (e.g. an LLM one) without touching orchestration. */
  propose?: (input: CaptureInput, options: ProposerOptions) => RecordProposal[];
};

function sourceKindFor(input: CaptureInput): KernelSource["kind"] {
  return input.kind;
}

/** Origin for records derived from a capture: user-typed text is `user`
 *  authorship, but the structured interpretation is still machine-derived,
 *  so a note that echoes the raw text is `user` and a typed schema record is
 *  `derived`. A plain note keeps user authorship; everything structured is
 *  derived. */
function originForProposal(proposal: RecordProposal): RecordOrigin {
  return proposal.schemaId === "note" ? "user" : "derived";
}

export function runCapturePipeline(
  input: CaptureInput,
  registry: SchemaRegistry,
  options: CapturePipelineOptions = {},
): CaptureOutcome {
  const now = options.now ?? (() => new Date());
  const nowIso = now().toISOString();
  const rawContent = input.content;
  const sensitive = containsLikelySecret(rawContent);

  const source: KernelSource = {
    id: createKernelId("src"),
    kind: sourceKindFor(input),
    locator: input.url,
    // Raw-input retention is the default (architecture §16.4): the original is
    // kept so re-derivation reads the source, not a prior interpretation.
    rawBody: rawContent,
    capturedAt: nowIso,
    retention: "retained",
  };

  const propose = options.propose ?? proposeRecords;
  const proposals = propose(input, options);
  const automationFor = options.automationForSchema ?? (() => "auto" as AutomationLevel);

  const records = proposals.map<CaptureRecordOutcome>((proposal) => {
    const evaluation = evaluateApply({
      confidence: proposal.confidence,
      // The pilot only ever creates new records; mutation lands in a later slice.
      mutatesExisting: false,
      createsNewEntity: proposal.introducesNewEntity ?? false,
      sensitive,
      automationLevel: automationFor(proposal.schemaId),
      reversible: true,
    });

    const created = createRecord(
      {
        schemaId: proposal.schemaId,
        title: proposal.title,
        body: proposal.body,
        occurredStart: proposal.occurredStart,
        timeBasis: proposal.timeBasis,
        origin: originForProposal(proposal),
        status: statusForDecision(evaluation.decision),
        properties: proposal.properties,
        now,
      },
      registry,
    );

    const sourceLink: SourceLink = {
      sourceId: source.id,
      recordId: created.record.id,
      role: "origin",
      confidence: proposal.confidence,
    };

    return {
      created,
      sourceLink,
      decision: evaluation.decision,
      reason: evaluation.reason,
      confidence: proposal.confidence,
    };
  });

  return { source, sensitive, records };
}

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
  KernelEntity,
  KernelRelation,
  KernelSource,
  RecordOrigin,
  SourceLink,
} from "../record-kernel/kernelTypes";
import { containsLikelySecret } from "../connectors/redaction";
import type { KernelRule } from "../record-kernel/kernelTypes";
import { resolveEntities } from "./entityResolution";
import {
  evaluateApply,
  statusForDecision,
  type ApplyDecision,
  type AutomationLevel,
} from "./applyPolicy";
import type { CaptureInput, RecordProposal } from "./captureTypes";
import {
  automationLevelFor,
  classifyProposal,
  normalizeEntityName,
} from "./personalization";
import { proposeRecords, type ProposerOptions } from "./ruleBasedProposer";

/** One proposed record resolved to a concrete apply decision + built record. */
export type CaptureRecordOutcome = {
  created: CreatedRecord;
  sourceLink: SourceLink;
  /** record → references → entity links for this record's mentions. */
  relations: KernelRelation[];
  decision: ApplyDecision;
  reason: string;
  confidence: number;
};

export type CaptureOutcome = {
  /** The raw trace, preserved regardless of any apply decision. */
  source: KernelSource;
  /** Entities newly created while resolving this capture's mentions. */
  newEntities: KernelEntity[];
  sensitive: boolean;
  records: CaptureRecordOutcome[];
};

export type CapturePipelineOptions = ProposerOptions & {
  /** Per-schema automation level; defaults to `auto` for unlisted schemas.
   *  Overridden by any matching automation-level rule in `rules`. */
  automationForSchema?: (schemaId: string) => AutomationLevel;
  /** The user's personalization rules (alias / classification /
   *  context-binding / automation-level), applied to every proposal. */
  rules?: KernelRule[];
  /** Entities Mori already knows, so a mention resolves to an existing entity
   *  instead of duplicating it. New mentions create new entities. */
  entities?: KernelEntity[];
  /** Swap the proposer (e.g. an LLM one) without touching orchestration. */
  propose?: (input: CaptureInput, options: ProposerOptions) => RecordProposal[];
};

/** Applies the user's rules to one proposal: canonicalise entity mentions,
 *  reclassify the schema, and attach bound contexts. Returns the adjusted
 *  proposal plus the contexts the rules added. */
function personalizeProposal(
  proposal: RecordProposal,
  rules: KernelRule[],
): { proposal: RecordProposal; addedContextIds: string[] } {
  const entityMentions = proposal.entityMentions.map((mention) => ({
    ...mention,
    canonicalName: normalizeEntityName(mention.canonicalName, rules),
  }));
  const classification = classifyProposal(proposal, rules);
  return {
    proposal: { ...proposal, entityMentions, schemaId: classification.schemaId },
    addedContextIds: classification.addedContextIds,
  };
}

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
  const rawProposals = propose(input, options);
  const rules = options.rules ?? [];
  const schemaAutomationOverride = options.automationForSchema;
  // Running set so two proposals mentioning the same new entity share one.
  const knownEntities: KernelEntity[] = [...(options.entities ?? [])];
  const newEntities: KernelEntity[] = [];

  const records = rawProposals.map<CaptureRecordOutcome>((rawProposal) => {
    const { proposal, addedContextIds } = personalizeProposal(rawProposal, rules);
    // Rules win when present; otherwise the caller's per-schema default, else auto.
    const ruleLevel = automationLevelFor(
      proposal.schemaId,
      addedContextIds,
      rules,
      schemaAutomationOverride ? schemaAutomationOverride(proposal.schemaId) : "auto",
    );
    const evaluation = evaluateApply({
      confidence: proposal.confidence,
      // The pilot only ever creates new records; mutation lands in a later slice.
      mutatesExisting: false,
      createsNewEntity: proposal.introducesNewEntity ?? false,
      sensitive,
      automationLevel: ruleLevel,
      reversible: true,
    });

    const created = createRecord(
      {
        schemaId: proposal.schemaId,
        title: proposal.title,
        body: proposal.body,
        occurredStart: proposal.occurredStart,
        timeBasis: proposal.timeBasis,
        timeConfidence: proposal.timeConfidence,
        origin: originForProposal(proposal),
        status: statusForDecision(evaluation.decision),
        contextIds: addedContextIds,
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

    // Resolve the proposal's mentions to stable entities and link the record
    // to each, so a later rename of an entity updates every reference.
    const resolution = resolveEntities(proposal.entityMentions, knownEntities, now);
    for (const entity of resolution.newEntities) {
      knownEntities.push(entity);
      newEntities.push(entity);
    }
    const relations = resolution.resolved.map<KernelRelation>((item) => ({
      id: createKernelId("rel"),
      fromRecordId: created.record.id,
      type: "references",
      toEntityId: item.entity.id,
      createdAt: nowIso,
    }));

    return {
      created,
      sourceLink,
      relations,
      decision: evaluation.decision,
      reason: evaluation.reason,
      confidence: proposal.confidence,
    };
  });

  return { source, newEntities, sensitive, records };
}

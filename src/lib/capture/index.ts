export type {
  CaptureInput,
  CaptureProposalSet,
  EntityMention,
  RecordProposal,
} from "./captureTypes";
export {
  AUTO_CONFIDENCE_CEILING,
  CONFIRM_CONFIDENCE_FLOOR,
  evaluateApply,
  statusForDecision,
  type ApplyDecision,
  type ApplyEvaluation,
  type ApplyFactors,
  type AutomationLevel,
} from "./applyPolicy";
export { proposeRecords, type ProposerOptions } from "./ruleBasedProposer";
export {
  automationLevelFor,
  buildAliasRule,
  classifyProposal,
  normalizeEntityName,
  type ClassificationResult,
} from "./personalization";
export {
  runCapturePipeline,
  type CaptureOutcome,
  type CapturePipelineOptions,
  type CaptureRecordOutcome,
} from "./capturePipeline";

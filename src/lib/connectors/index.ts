export type {
  ConnectorEvent,
  ConnectorEventBatch,
  ConnectorEventKind,
  ConnectorCaptureMethod,
  ConnectorRawDataPolicy,
  ConnectorId,
  ConnectorPrivacyBoundary,
  ConnectorProvenance,
  ConnectorGitMetadata,
  ConnectorFileChange,
  ConnectorToolMetadata,
  ConnectorParseOutcome,
  ConnectorValidationError,
  ConnectorIngestResult,
  NormalizedImportCandidateLike,
} from "./types";
export {
  CONNECTOR_EVENT_KINDS,
  CONNECTOR_CAPTURE_METHODS,
  CONNECTOR_RAW_DATA_POLICIES,
  KNOWN_CONNECTOR_IDS,
} from "./types";
export {
  parseConnectorJsonl,
  validateConnectorEvent,
  validateConnectorEventBatch,
} from "./validation";
export {
  normalizeConnectorEventBatch,
  type NormalizeConnectorBatchInput,
} from "./normalizeConnectorEvents";
export {
  ingestConnectorJsonl,
  ingestConnectorEventBatch,
  buildCandidatesFromEvents,
} from "./localConnectorIngest";
export {
  buildConnectorJsonlPreview,
  buildConnectorJsonlPreviewWithSession,
  buildConnectorJsonlPreviewWithHistory,
  applyDuplicateOverlay,
  applyHistoryOverlay,
  summariseParseOutcome,
  describeConnectorWarningCode,
  type ConnectorJsonlPreview,
  type ConnectorJsonlPreviewKind,
  type ConnectorJsonlBucketPreview,
  type ConnectorPreviewWarning,
  type ConnectorPreviewWarningCode,
} from "./jsonlPreview";
export {
  buildConnectorImportHistory,
  classifyConnectorImportBatch,
  collectConnectorEventIdsFromSession,
  collectConnectorEventIdsFromSessions,
  pickDuplicateEventsFromClassification,
  pickNewEventsFromClassification,
  summarizeConnectorImportOverlap,
  type ConnectorImportClassifiedEvent,
  type ConnectorImportEventClassification,
  type ConnectorImportHistory,
  type ConnectorImportHistoryInput,
  type ConnectorImportHistorySavedSession,
  type ConnectorImportOverlapSummary,
} from "./connectorImportHistory";
export {
  buildConnectorSourceImportSummary,
  describeConnectorSourceImportBadge,
  emptyConnectorSourceImportSummary,
  getConnectorSourceImportBadgeTone,
  type ConnectorImportSummaryMatchedSession,
  type ConnectorSourceImportDefaultAction,
  type ConnectorSourceImportStatus,
  type ConnectorSourceImportSummary,
  type ConnectorSourceImportTimeRange,
} from "./connectorImportSummary";
export {
  mergeConnectorCandidatesForReview,
} from "./mergeForReview";
export {
  collectConnectorEventIdsFromCandidates,
  collectImportedConnectorEventIds,
  getConnectorEventIdentity,
  getConnectorEventIdentityFromSourceRef,
  getConnectorEventIdentityFromTimelineEvent,
  markConnectorEventsAsDuplicate,
  parseConnectorEventIdentity,
  partitionConnectorEventsByIdentity,
  type ConnectorEventIdentity,
  type MarkedConnectorEvent,
} from "./connectorEventIdentity";
export { redactText, containsLikelySecret, type RedactionResult } from "./redaction";
export {
  describeCaptureSurfaceStatus,
  getAllCaptureSurfaces,
  getCaptureSurfaceForIntegration,
  getCaptureSurfacesByFamily,
  getCaptureSurfacesByStatus,
  getImplementedCaptureSurfaces,
  getNextConnectorMilestone,
  getPlannedCaptureSurfaces,
} from "./captureSurfaces";
export type {
  CaptureSurfaceCaptureMode,
  CaptureSurfaceId,
  CaptureSurfaceRawDataPolicy,
  CaptureSurfaceRow,
  CaptureSurfaceStatus,
  CaptureSurfaceStatusDescription,
  CaptureSurfaceSurface,
  CaptureSurfaceToolFamily,
  NextConnectorMilestone,
} from "./captureSurfaces";

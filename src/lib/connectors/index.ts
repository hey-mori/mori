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
  summariseParseOutcome,
  type ConnectorJsonlPreview,
  type ConnectorJsonlPreviewKind,
  type ConnectorJsonlBucketPreview,
  type ConnectorPreviewWarning,
} from "./jsonlPreview";
export {
  mergeConnectorCandidatesForReview,
} from "./mergeForReview";
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

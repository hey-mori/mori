export * from "./kernelTypes";
export { SYSTEM_SCHEMAS, getSystemSchema } from "./systemSchemas";
export {
  KernelValidationError,
  createSchemaRegistry,
  validateRecordAgainstSchema,
  validateSchemaDefinition,
  type RecordValidationResult,
  type SchemaRegistry,
} from "./schemaRegistry";
export {
  applyRecordPatch,
  createKernelId,
  createRecord,
  type CreateRecordInput,
  type CreatedRecord,
  type RecordPatch,
  type UpdatedRecord,
} from "./recordFactory";
export { KernelBrowserStore } from "./kernelStore";
export {
  KernelRepository,
  getKernelRepository,
  setKernelRepositoryForTesting,
  type KernelDesktopCommands,
  type KernelRepositoryOptions,
  type KernelResult,
  type KernelRuntime,
  type KernelStorageSource,
} from "./kernelRepository";
export {
  convertMissingProjectContexts,
  projectContextId,
  projectToContext,
  type ProjectLike,
} from "./projectContextConverter";

export {
  buildClaudeHookCommand,
  buildConnectorStatusViewModels,
  getConnectorInstallerMeta,
  listConnectorInstallers,
  type BuildConnectorStatusInput,
  type ClaudeHookInstallResult,
  type ClaudeHookUninstallResult,
  type ConnectorCaptureModel,
  type ConnectorDetectionResult,
  type ConnectorInstallerId,
  type ConnectorInstallerMeta,
  type ConnectorStatusViewModel,
} from "./connectorInstaller";
export {
  detectConnectorStatus,
  installClaudeHook,
  isConnectorStatusDetectionAvailable,
  loadConnectorStatus,
  uninstallClaudeHook,
  type ClaudeHookScope,
} from "./connectorInstallerTauri";

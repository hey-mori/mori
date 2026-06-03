import type { ConnectorInboxFile, ConnectorInboxListing } from "../desktop";

export const SOURCE_INBOX_PREVIEW_LIMIT = 3;

const ALL_CONNECTOR_FAMILIES = [
  "claude-code",
  "codex-cli",
  "opencode-cli",
  "local-capture",
  "mcp",
  "terminal",
  "git",
  "other",
] as const;

const INBOX_FAMILIES_BY_PROVIDER: Record<string, string[]> = {
  claude: ["claude-code"],
  codex: ["codex-cli"],
  opencode: ["opencode-cli"],
  terminal: ["local-capture", "terminal"],
  git: ["local-capture", "git"],
  note: ["local-capture"],
  ide: ["local-capture"],
  mcp: ["mcp"],
  connector: [...ALL_CONNECTOR_FAMILIES],
};

export type SourceInboxHint = {
  providerId: string;
  families: string[];
  files: ConnectorInboxFile[];
  latestFile: ConnectorInboxFile | null;
  fileCount: number;
  rootPath: string;
  rootExists: boolean;
};

export function getInboxFamiliesForProvider(providerId: string): string[] {
  return [...(INBOX_FAMILIES_BY_PROVIDER[providerId] ?? [])];
}

export function buildSourceInboxHint(
  providerId: string,
  inbox: ConnectorInboxListing,
  limit: number = SOURCE_INBOX_PREVIEW_LIMIT,
): SourceInboxHint | null {
  const families = getInboxFamiliesForProvider(providerId);
  if (families.length === 0) return null;

  const familySet = new Set(families);
  const files = inbox.files
    .filter((file) => familySet.has(file.connectorFamily))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  return {
    providerId,
    families,
    files: files.slice(0, Math.max(0, limit)),
    latestFile: files[0] ?? null,
    fileCount: files.length,
    rootPath: inbox.rootPath,
    rootExists: inbox.rootExists,
  };
}

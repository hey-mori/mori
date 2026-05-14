import type { TrustLevel } from "../../domain/types";

/**
 * Integration status for source types
 */
export type IntegrationStatus =
  | "implemented"    // Fully working with real data
  | "partial"        // Working but limited functionality
  | "planned"        // Designed but not yet implemented
  | "mockOnly"       // Only exists in demo/mock data
  | "unavailable";   // Not available in current runtime (e.g., Tauri-only features in browser)

/**
 * How data is captured from this source
 */
export type CaptureMode =
  | "manual"              // User manually inputs/pastes data
  | "explicitImport"      // User explicitly imports from external source
  | "desktopCommand"      // Tauri desktop command (requires desktop app)
  | "plannedConnector"    // Future connector/extension/plugin
  | "mock";               // Demo/mock data only

/**
 * Privacy policy for raw data handling
 */
export type RawDataPolicy =
  | "retained"      // Full raw data kept locally
  | "summaryOnly"   // Only summary/metadata kept
  | "redacted"      // Sensitive content removed before storage
  | "notCaptured";  // Raw data never captured

/**
 * Types of records this integration can produce
 */
export type OutputRecordTypes = {
  sources: boolean;
  timelineEvents: boolean;
  issues: boolean;
  decisions: boolean;
  relationships: boolean;
  artifacts: boolean;
};

/**
 * Source integration definition
 */
export type SourceIntegration = {
  id: string;
  label: string;
  description: string;
  status: IntegrationStatus;
  trustDefault: TrustLevel;
  rawDataPolicy: RawDataPolicy;
  captureMode: CaptureMode;
  privacyNote: string;
  supportedInputTypes: string[];
  outputRecords: OutputRecordTypes;
};

/**
 * Mori Source Integration Registry
 * 
 * Catalogs all current and planned source integrations with their status,
 * trust levels, privacy policies, and capabilities.
 */
export const SOURCE_REGISTRY: Record<string, SourceIntegration> = {
  manualNote: {
    id: "manualNote",
    label: "Manual Note",
    description: "Free-form text notes directly entered by the user",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "retained",
    captureMode: "manual",
    privacyNote: "User controls all content. No automatic capture or redaction.",
    supportedInputTypes: ["text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  url: {
    id: "url",
    label: "URL / Browser Page",
    description: "Web page URLs with optional text excerpts",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "retained",
    captureMode: "manual",
    privacyNote: "User explicitly pastes URLs and excerpts. No automatic tab scanning.",
    supportedInputTypes: ["text/uri-list", "text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  aiConversation: {
    id: "aiConversation",
    label: "AI Conversation (Other)",
    description: "Generic AI conversation transcripts from other AI assistants",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "manual",
    privacyNote: "User explicitly pastes conversation text from any AI assistant. No automatic capture.",
    supportedInputTypes: ["text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  gitDiff: {
    id: "gitDiff",
    label: "Git Diff (Paste)",
    description: "Pasted unified git diff output",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "retained",
    captureMode: "manual",
    privacyNote: "User explicitly pastes git diff output. No filesystem scanning.",
    supportedInputTypes: ["text/x-diff", "text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  tauriGitDiff: {
    id: "tauriGitDiff",
    label: "Git Diff (Desktop Command)",
    description: "Git diff captured via Tauri desktop command against saved repository",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "retained",
    captureMode: "desktopCommand",
    privacyNote: "Runs 'git diff' against explicitly saved repository paths only. No automatic scanning.",
    supportedInputTypes: ["text/x-diff"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  repository: {
    id: "repository",
    label: "Repository Settings",
    description: "Saved repository paths for explicit Git diff capture",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "notCaptured",
    captureMode: "desktopCommand",
    privacyNote: "Only remembers user-added repository paths. Never scans disk automatically.",
    supportedInputTypes: [],
    outputRecords: {
      sources: false,
      timelineEvents: false,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  quickPass: {
    id: "quickPass",
    label: "Quick Pass Analysis",
    description: "Local analysis that extracts issues, decisions, and relationships from imported sources",
    status: "implemented",
    trustDefault: "inferred",
    rawDataPolicy: "summaryOnly",
    captureMode: "manual",
    privacyNote: "Runs on-demand analysis of imported sources. Uses local heuristics or local LLM (Ollama).",
    supportedInputTypes: [],
    outputRecords: {
      sources: false,
      timelineEvents: false,
      issues: true,
      decisions: true,
      relationships: true,
      artifacts: false,
    },
  },

  terminal: {
    id: "terminal",
    label: "Terminal Commands",
    description: "Terminal command history and output summaries",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Future: explicit opt-in terminal connector. Will require user approval per command.",
    supportedInputTypes: ["text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  fileSystem: {
    id: "fileSystem",
    label: "File System Changes",
    description: "Local file creation, modification, and deletion events",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Future: explicit project folder monitoring. Will require user approval and privacy boundaries.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: true,
    },
  },

  editor: {
    id: "editor",
    label: "Code Editor Activity",
    description: "Generic code editor file opens, edits, and navigation",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Future: editor-agnostic connector. Will capture file-level events only, not keystrokes.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  vscode: {
    id: "vscode",
    label: "VS Code",
    description: "VS Code specific file activity and extension events",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Future: VS Code extension. Will respect VS Code privacy settings.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  cursor: {
    id: "cursor",
    label: "Cursor Editor",
    description: "Cursor editor AI conversation and file activity",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Future: Cursor extension. Will capture AI interactions with user approval.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  browserTab: {
    id: "browserTab",
    label: "Browser Tabs",
    description: "Active browser tab titles and navigation events",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Future: browser extension. Will require explicit site approval. No content capture.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  claudeTranscript: {
    id: "claudeTranscript",
    label: "Claude Transcript",
    description: "Claude AI conversation transcripts via manual paste",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "manual",
    privacyNote: "User explicitly pastes Claude conversation text. Direct Claude API connector is planned for future.",
    supportedInputTypes: ["text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  codexTranscript: {
    id: "codexTranscript",
    label: "Codex Transcript",
    description: "GitHub Copilot / Codex interaction transcripts",
    status: "planned",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "explicitImport",
    privacyNote: "Future: explicit Codex transcript import. User controls which sessions to import.",
    supportedInputTypes: ["application/json", "text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  chatgptTranscript: {
    id: "chatgptTranscript",
    label: "ChatGPT Transcript",
    description: "ChatGPT conversation transcripts via manual paste or export",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "manual",
    privacyNote: "User explicitly pastes ChatGPT conversation text. Direct ChatGPT API connector is planned for future.",
    supportedInputTypes: ["text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  docs: {
    id: "docs",
    label: "Documentation Sites",
    description: "Technical documentation and reference page visits",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Future: browser extension for docs sites. Will capture page titles only, not content.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  slack: {
    id: "slack",
    label: "Slack Messages",
    description: "Slack conversation imports from specific channels",
    status: "planned",
    trustDefault: "verified",
    rawDataPolicy: "redacted",
    captureMode: "plannedConnector",
    privacyNote: "Future: Slack connector with explicit channel approval. Will redact sensitive content.",
    supportedInputTypes: ["application/json"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  figma: {
    id: "figma",
    label: "Figma",
    description: "Figma file access and comment imports",
    status: "planned",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Future: Figma plugin with explicit file approval. Will capture metadata and comments only.",
    supportedInputTypes: ["application/json"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: true,
    },
  },

  notion: {
    id: "notion",
    label: "Notion",
    description: "Notion page edits and comment imports",
    status: "planned",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Future: Notion integration with explicit page approval. Will respect Notion privacy settings.",
    supportedInputTypes: ["application/json", "text/markdown"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: true,
    },
  },
};

/**
 * Get integration definition by ID
 */
export function getIntegration(id: string): SourceIntegration | undefined {
  return SOURCE_REGISTRY[id];
}

/**
 * Get all integrations with a specific status
 */
export function getIntegrationsByStatus(status: IntegrationStatus): SourceIntegration[] {
  return Object.values(SOURCE_REGISTRY).filter((integration) => integration.status === status);
}

/**
 * Get all implemented integrations
 */
export function getImplementedIntegrations(): SourceIntegration[] {
  return getIntegrationsByStatus("implemented");
}

/**
 * Get all planned integrations
 */
export function getPlannedIntegrations(): SourceIntegration[] {
  return getIntegrationsByStatus("planned");
}

/**
 * Check if an integration is available in the current runtime
 */
export function isIntegrationAvailable(id: string, isTauri: boolean): boolean {
  const integration = getIntegration(id);
  if (!integration) return false;
  
  if (integration.status === "unavailable" || integration.status === "mockOnly") {
    return false;
  }
  
  // Desktop-only integrations require Tauri
  if (integration.captureMode === "desktopCommand" && !isTauri) {
    return false;
  }
  
  return integration.status === "implemented" || integration.status === "partial";
}

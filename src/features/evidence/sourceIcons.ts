import {
  Bot,
  Boxes,
  Code2,
  FileText,
  Folder,
  GitCommit,
  Globe,
  Layers,
  MessageSquare,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";

const SOURCE_ICON: Record<string, LucideIcon> = {
  manualNote: FileText,
  url: Globe,
  aiConversation: Bot,
  claudeTranscript: Sparkles,
  chatgptTranscript: Bot,
  codexTranscript: Code2,
  connectorJsonl: Terminal,
  gitDiff: GitCommit,
  tauriGitDiff: GitCommit,
  repository: Folder,
  terminal: Terminal,
  fileSystem: Folder,
  editor: Code2,
  vscode: Code2,
  cursor: Code2,
  browser: Globe,
  browserTab: Globe,
  docs: FileText,
  slack: MessageSquare,
  notion: Layers,
  figma: Boxes,
};

export function getSourceIcon(kind: string): LucideIcon {
  return SOURCE_ICON[kind] ?? FileText;
}

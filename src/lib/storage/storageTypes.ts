import type { Project, Session, SourceRef, TimelineEvent } from "../../domain/types";
import type { MoriAnalysisResult, QuickPassAnalysisSettings } from "../analysis";
import type { NormalizedImportCandidate } from "../import";
import type { MoriPackageV0 } from "../mori-package";

export type StoredSessionDraft = {
  project: Project;
  session: Session;
  savedAt: string;
  adapter: "browser-local-storage";
};

export type StoredMoriPackageDraft = {
  packageId: string;
  package: MoriPackageV0;
  savedAt: string;
  adapter: "browser-local-storage";
};

export type StoredSessionSummary = {
  sessionId: string;
  projectId: string;
  title: string;
  projectName: string;
  savedAt: string;
  status: Session["status"];
};

export type StoredSessionImport = {
  id: string;
  sessionId: string;
  source: SourceRef;
  events: TimelineEvent[];
  savedAt: string;
  adapter: "browser-local-storage";
};

export type StoredSessionAnalysis = {
  sessionId: string;
  result: MoriAnalysisResult;
  savedAt: string;
  adapter: "browser-local-storage";
};

export type MoriDraftRepository = {
  saveCurrentSessionDraft: (draft: Omit<StoredSessionDraft, "savedAt" | "adapter">) => StoredSessionDraft;
  loadCurrentSessionDraft: () => StoredSessionDraft | null;
  clearCurrentSessionDraft: () => void;
  listStoredSessions: () => StoredSessionSummary[];
  saveMoriPackageDraft: (pkg: MoriPackageV0) => StoredMoriPackageDraft;
  loadMoriPackageDraft: (packageId: string) => StoredMoriPackageDraft | null;
  clearStoredSession: (sessionId: string) => void;
  addSessionImport: (sessionId: string, candidate: NormalizedImportCandidate) => StoredSessionImport;
  listSessionImports: (sessionId: string) => StoredSessionImport[];
  removeSessionImport: (sessionId: string, importId: string) => void;
  clearSessionImports: (sessionId: string) => void;
  saveSessionAnalysis: (sessionId: string, result: MoriAnalysisResult) => StoredSessionAnalysis;
  loadSessionAnalysis: (sessionId: string) => StoredSessionAnalysis | null;
  clearSessionAnalysis: (sessionId: string) => void;
  saveQuickPassSettings: (settings: QuickPassAnalysisSettings) => QuickPassAnalysisSettings;
  loadQuickPassSettings: () => QuickPassAnalysisSettings;
};

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key"> & {
  readonly length: number;
};

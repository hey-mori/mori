import {
  Bot,
  Download,
  FileText,
  FolderOpen,
  GitCommit,
  Globe,
  Layers,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  GitDiffParseError,
  isChatGptExport,
  normalizeAiTranscript,
  normalizeGitDiff,
  normalizeManualNote,
  normalizeUrlSource,
  type AiTranscriptPlatform,
  type NormalizedImportCandidate,
} from "../../lib/import";
import {
  buildConnectorJsonlPreviewWithHistory,
  buildConnectorSourceImportSummary,
  describeConnectorSourceImportBadge,
  describeConnectorWarningCode,
  getConnectorSourceImportBadgeTone,
  mergeConnectorCandidatesForReview,
  normalizeConnectorEventBatch,
  type ConnectorImportHistorySavedSession,
  type ConnectorJsonlPreview,
  type ConnectorSourceImportSummary,
} from "../../lib/connectors";
import {
  ConnectorInboxUnavailableError,
  formatConnectorFamily,
  formatInboxFileSize,
  formatInboxModifiedAt,
  isConnectorInboxAvailable,
  listConnectorJsonlInbox,
  readConnectorJsonlFile,
  type ConnectorInboxFile,
  type ConnectorInboxListing,
} from "../../lib/desktop/connectorInbox";
import { getRepositoryVerificationFreshness } from "../../lib/repositories";
import { formatDateTime, formatTime } from "../../lib/formatting/time";
import {
  loadConnectorImportHistorySavedSessionsAsync,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { selectActiveRepository, useRepositoryStore } from "../../app/repositoryStore";
import type { ReviewOrigin } from "../../lib/review";
import { isTauriRuntime, pickRepositoryDirectory, runGitDiff } from "../../lib/desktop";

type ImportKind = "note" | "url" | "ai" | "git" | "connector";

type ImportStatus = { tone: "ok" | "error" | "info"; message: string } | null;

export type ImportPanelProps = {
  /**
   * Pre-select an import tab when the panel mounts. Used by the Evidence Hub
   * so clicking an "Available now" card opens the right import surface.
   */
  initialKind?: ImportKind;
  /**
   * Pre-select an AI platform when the panel mounts with `initialKind: "ai"`.
   * Lets the Hub send the user straight into Claude / ChatGPT / Codex / Other.
   */
  initialAiPlatform?: AiTranscriptPlatform;
  /**
   * When true (Hub-embedded mode), the panel renders as a focused sub-card
   * with an optional close button instead of the full standalone surface.
   */
  variant?: "standalone" | "embedded";
  /**
   * Called when the user dismisses the embedded import surface.
   */
  onClose?: () => void;
};

export function ImportPanel(props: ImportPanelProps = {}) {
  const { initialKind, initialAiPlatform, variant = "standalone", onClose } = props;
  const draft = useSessionStore((state) => state.draft);
  const sessionView = useSessionStore(selectSessionView);
  const imports = useSessionStore((state) => state.imports);
  const addImport = useSessionStore((state) => state.addImport);
  const removeImport = useSessionStore((state) => state.removeImport);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const openSettingsSheet = useAppStore((state) => state.openSettingsSheet);
  const setSelectedEventId = useAppStore((state) => state.setSelectedEventId);
  const beginPendingReview = useSessionStore((state) => state.beginPendingReview);

  const [kind, setKind] = useState<ImportKind>(initialKind ?? "note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<AiTranscriptPlatform>(initialAiPlatform ?? "claude");
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState<ImportStatus>(null);
  const [repoPath, setRepoPath] = useState("");
  const [repoRange, setRepoRange] = useState("HEAD");
  const [staged, setStaged] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [picking, setPicking] = useState(false);
  const repositorySettings = useRepositoryStore((state) => state.settings);
  const repositoriesInitialized = useRepositoryStore((state) => state.initialized);
  const hydrateRepositories = useRepositoryStore((state) => state.hydrate);

  // The contract left on `repositoryStore.hydrate` when the startup call was
  // removed (#10): the surface that gives the feature a way in owns hydrating
  // it. This panel lists saved repository paths for the Git diff tab, so
  // without this that list is empty however many the user has saved.
  useEffect(() => {
    if (!repositoriesInitialized) hydrateRepositories();
  }, [repositoriesInitialized, hydrateRepositories]);
  const selectRepository = useRepositoryStore((state) => state.selectRepository);
  const markRepositoryUsed = useRepositoryStore((state) => state.markRepositoryUsed);
  const refreshRepositoryMetadataAfterCapture = useRepositoryStore(
    (state) => state.refreshRepositoryMetadataAfterCapture,
  );
  const activeRepository = useRepositoryStore(selectActiveRepository);
  const [selectedRepoId, setSelectedRepoId] = useState<string>(activeRepository?.id ?? "");

  /** Live preview snapshot for the Connector JSONL tab; null until the user clicks Parse. */
  const [connectorPreview, setConnectorPreview] = useState<ConnectorJsonlPreview | null>(null);
  /** Opt-in toggle that overrides the default skip-duplicates behavior. */
  const [connectorIncludeDuplicates, setConnectorIncludeDuplicates] = useState(false);
  /** Inbox listing returned from the desktop runtime; null until the user clicks Refresh. */
  const [connectorInbox, setConnectorInbox] = useState<ConnectorInboxListing | null>(null);
  /** Path of the inbox file currently loaded into the textarea, when any. */
  const [connectorInboxSelectedPath, setConnectorInboxSelectedPath] = useState<string | null>(null);
  /** True while the desktop bridge is refreshing or reading a file. */
  const [connectorInboxBusy, setConnectorInboxBusy] = useState(false);
  /** Inline status / error message for the inbox section. */
  const [connectorInboxStatus, setConnectorInboxStatus] = useState<
    { tone: "info" | "error"; message: string } | null
  >(null);
  const connectorInboxAvailable = useMemo(() => isConnectorInboxAvailable(), []);

  const canImport = useMemo(() => Boolean(draft), [draft]);
  const desktopRuntime = useMemo(() => isTauriRuntime(), []);

  // Keep the local dropdown in sync with the persisted default and prefill the
  // path field whenever the saved selection arrives from hydrate or changes in
  // Settings. We only auto-fill when the user has not typed anything yet so we
  // never overwrite an in-progress manual edit.
  useEffect(() => {
    if (!activeRepository) return;
    if (selectedRepoId && repoPath.trim()) return;
    setSelectedRepoId(activeRepository.id);
    setRepoPath(activeRepository.path);
  }, [activeRepository, repoPath, selectedRepoId]);

  // When the Evidence Hub opens this panel with a fresh kind / platform, sync
  // the local state so the right tab is active without forcing a remount.
  const lastInitial = useRef<{ kind?: ImportKind; platform?: AiTranscriptPlatform }>({});
  useEffect(() => {
    if (initialKind && initialKind !== lastInitial.current.kind) {
      setKind(initialKind);
      lastInitial.current.kind = initialKind;
    }
    if (initialAiPlatform && initialAiPlatform !== lastInitial.current.platform) {
      setPlatform(initialAiPlatform);
      lastInitial.current.platform = initialAiPlatform;
    }
  }, [initialKind, initialAiPlatform]);

  if (!draft) {
    return (
      <div className="import-panel">
        <div className="import-header">
          <div>
            <h2>소스 가져오기</h2>
            <p>소스에서 Claude 대화를 가져오거나, 메모·URL·AI 대화를 직접 추가할 수 있습니다.</p>
          </div>
          <Badge tone="gray">데모 세션</Badge>
        </div>
        <p className="import-help">
          현재 보이는 데이터는 데모용 모의 세션입니다. 소스에서 대화를 가져오거나 새 세션을 만들면 가져온 소스가
          이 화면에 실제로 누적됩니다.
        </p>
        <div className="import-actions">
          <Button variant="primary" icon={Plus} onClick={() => openSettingsSheet("connections")}>
            소스에서 가져오기
          </Button>
          <Button variant="secondary" icon={Plus} onClick={() => setCurrentView("start")}>
            새 세션
          </Button>
        </div>
      </div>
    );
  }

  function loadSavedSessionHistoryForActive(
    activeSessionId: string | null,
  ): Promise<ConnectorImportHistorySavedSession[]> {
    // Cross-session duplicate detection walks every saved session in the
    // local persistence layer. Browser mode pulls from localStorage drafts;
    // desktop mode additionally routes through the SQLite `session_imports`
    // table via `SessionImportRepository`, so SQLite-saved sessions
    // contribute to the rollup. The async loader resolves the right source
    // for the runtime.
    return loadConnectorImportHistorySavedSessionsAsync({
      excludeSessionId: activeSessionId,
    });
  }

  function reset() {
    setTitle("");
    setBody("");
    setUrl("");
    setOrigin("");
  }

  function handleSelectRepository(id: string) {
    setSelectedRepoId(id);
    if (!id) return;
    const repo = repositorySettings.repositories.find((entry) => entry.id === id);
    if (repo) {
      setRepoPath(repo.path);
      selectRepository(id);
    }
  }

  async function handlePickRepository() {
    if (!desktopRuntime) {
      setStatus({
        tone: "error",
        message: "Native folder picker는 Tauri 데스크톱 앱에서만 사용할 수 있습니다.",
      });
      return;
    }
    setPicking(true);
    try {
      const result = await pickRepositoryDirectory({ title: "Mori: Select repository for Git diff" });
      if (result.cancelled || !result.path) return;
      setRepoPath(result.path);
      setSelectedRepoId("");
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "폴더 선택기 오류가 발생했습니다.",
      });
    } finally {
      setPicking(false);
    }
  }

  async function handleFetchGitDiff() {
    if (!desktopRuntime) {
      setStatus({
        tone: "error",
        message: "Git diff 캡처는 Tauri 데스크톱 앱에서만 사용할 수 있습니다.",
      });
      return;
    }
    if (!repoPath.trim()) {
      setStatus({ tone: "error", message: "리포지토리 경로를 입력하거나 저장된 리포지토리를 선택하세요." });
      return;
    }

    setFetching(true);
    setStatus({ tone: "info", message: "git diff 실행 중..." });
    try {
      const result = await runGitDiff({
        repoPath: repoPath.trim(),
        range: repoRange.trim() || undefined,
        staged,
      });
      if (!result.diffText.trim()) {
        setStatus({
          tone: "error",
          message: `git diff returned empty output (exit ${result.exitCode}).${result.stderr ? ` stderr: ${result.stderr}` : ""}`,
        });
        return;
      }
      setBody(result.diffText);
      const originLabel = staged
        ? `${result.repoPath} (--staged${result.range ? ` ${result.range}` : ""})`
        : `${result.repoPath}${result.range ? ` ${result.range}` : ""}`;
      setOrigin(originLabel);
      const truncatedHint = result.truncated ? " (truncated)" : "";
      const okMessage = `Fetched ${result.fileCountHint} file${result.fileCountHint === 1 ? "" : "s"} in ${result.durationMs} ms${truncatedHint}. Review and click '세션에 추가' to import.`;
      setStatus({ tone: "ok", message: okMessage });
      const matched = repositorySettings.repositories.find((entry) => entry.path === repoPath.trim());
      if (matched) {
        markRepositoryUsed(matched.id);
        // The user explicitly clicked Fetch, so we can piggy-back a quick
        // verification refresh on the same intentional action. Failures here
        // never affect the diff the user already received.
        const outcome = await refreshRepositoryMetadataAfterCapture(matched.id);
        if (!outcome.ok) {
          setStatus({
            tone: "info",
            message: `${okMessage} (Repository metadata refresh failed: ${outcome.error})`,
          });
        }
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Git diff 캡처 중 오류가 발생했습니다.",
      });
    } finally {
      setFetching(false);
    }
  }

  function buildCandidate(): NormalizedImportCandidate | null {
    if (!draft) return null;
    const base = {
      projectId: draft.project.id,
      sessionId: draft.session.id,
    };

    if (kind === "note") {
      if (!body.trim()) {
        setStatus({ tone: "error", message: "메모 본문을 입력하세요." });
        return null;
      }
      return normalizeManualNote({ ...base, title: title.trim() || undefined, note: body });
    }

    if (kind === "url") {
      if (!url.trim()) {
        setStatus({ tone: "error", message: "URL을 입력하세요." });
        return null;
      }
      try {
        new URL(url.trim());
      } catch {
        setStatus({ tone: "error", message: "올바른 URL 형식이 아닙니다." });
        return null;
      }
      return normalizeUrlSource({
        ...base,
        title: title.trim() || url.trim(),
        url: url.trim(),
        selectedText: body.trim() || undefined,
      });
    }

    if (kind === "git") {
      if (!body.trim()) {
        setStatus({ tone: "error", message: "Git diff 텍스트를 붙여넣으세요." });
        return null;
      }
      try {
        return normalizeGitDiff({
          ...base,
          title: title.trim() || undefined,
          diffText: body,
          origin: origin.trim() || undefined,
        });
      } catch (error) {
        if (error instanceof GitDiffParseError) {
          setStatus({ tone: "error", message: error.message });
          return null;
        }
        throw error;
      }
    }

    if (!body.trim()) {
      setStatus({ tone: "error", message: "AI 대화 본문을 붙여넣으세요." });
      return null;
    }
    return normalizeAiTranscript({
      ...base,
      title: title.trim() || undefined,
      platform,
      text: body,
    });
  }

  function handleAdd() {
    const candidate = buildCandidate();
    if (!candidate) return;

    // AI transcripts and Git diffs flow through Import Review so the user can
    // inspect / accept / discard extracted events before they hit the session.
    // Manual notes and URLs are single user-typed items, so direct-apply
    // remains the right default for them.
    if (kind === "ai" || kind === "git") {
      const origin: ReviewOrigin = kind === "ai" ? "ai-transcript" : "git-diff";
      beginPendingReview(candidate, origin);
      setStatus({
        tone: "info",
        message: `'${candidate.source.title}' 가져오기 후보를 Import Review에서 확인하세요.`,
      });
      onClose?.();
      return;
    }

    const stored = addImport(candidate);
    if (!stored) {
      setStatus({ tone: "error", message: "세션을 찾을 수 없어 가져오지 못했습니다." });
      return;
    }

    const firstEventId = stored.events[0]?.id;
    if (firstEventId) setSelectedEventId(firstEventId);
    setStatus({ tone: "ok", message: `'${stored.source.title}' 소스를 세션에 추가했습니다.` });
    reset();
  }

  async function handlePreviewConnectorJsonl() {
    if (!body.trim()) {
      setStatus({ tone: "error", message: "Connector JSONL을 붙여넣은 뒤 Parse를 누르세요." });
      setConnectorPreview(null);
      return;
    }
    const preview = buildConnectorJsonlPreviewWithHistory(body, {
      activeSession: sessionView,
      savedSessions: await loadSavedSessionHistoryForActive(draft?.session.id ?? null),
    });
    setConnectorPreview(preview);
    if (preview.kind === "empty") {
      setStatus({ tone: "error", message: "유효한 라인이 없습니다." });
    } else if (preview.kind === "errors-only") {
      setStatus({
        tone: "error",
        message: `${preview.invalidLineCount}개 라인이 파싱에 실패했습니다. 라인 번호를 확인하세요.`,
      });
    } else if (preview.duplicateEventCount > 0 && preview.newEventCount === 0) {
      setStatus({
        tone: "info",
        message: "모든 이벤트가 이미 가져온 항목입니다. Import Review는 비활성화됩니다.",
      });
    } else {
      setStatus({ tone: "ok", message: preview.headline });
    }
  }

  async function handleRefreshConnectorInbox() {
    if (!connectorInboxAvailable) {
      setConnectorInboxStatus({
        tone: "error",
        message: "Connector inbox file reading은 Tauri 데스크톱 앱에서만 사용할 수 있습니다.",
      });
      return;
    }
    setConnectorInboxBusy(true);
    setConnectorInboxStatus({ tone: "info", message: "inbox 새로 고침 중..." });
    try {
      const listing = await listConnectorJsonlInbox();
      setConnectorInbox(listing);
      if (!listing.rootExists) {
        setConnectorInboxStatus({
          tone: "info",
          message: `Inbox 디렉터리가 아직 없습니다: ${listing.rootPath}`,
        });
      } else if (listing.files.length === 0) {
        setConnectorInboxStatus({
          tone: "info",
          message: `Inbox는 비어 있습니다 (${listing.rootPath})`,
        });
      } else {
        setConnectorInboxStatus({
          tone: "info",
          message: `${listing.files.length}개 파일을 찾았습니다.`,
        });
      }
    } catch (error) {
      if (error instanceof ConnectorInboxUnavailableError) {
        setConnectorInboxStatus({ tone: "error", message: error.message });
      } else {
        setConnectorInboxStatus({
          tone: "error",
          message: error instanceof Error ? error.message : "Inbox 조회 실패",
        });
      }
    } finally {
      setConnectorInboxBusy(false);
    }
  }

  async function handleLoadConnectorInboxFile(file: ConnectorInboxFile) {
    if (!connectorInboxAvailable) return;
    setConnectorInboxBusy(true);
    setConnectorInboxStatus({ tone: "info", message: `Loading ${file.displayName}...` });
    try {
      const result = await readConnectorJsonlFile(file.path);
      setBody(result.text);
      setConnectorInboxSelectedPath(result.path);
      // Run Parse / Preview automatically — the user just made an explicit
      // file selection, so refreshing the preview is exactly what they want.
      // The history-aware preview lights up cross-session duplicate
      // detection so the user sees "Already imported · N" (both current and
      // saved sessions) without a second click.
      const preview = buildConnectorJsonlPreviewWithHistory(result.text, {
        activeSession: sessionView,
        savedSessions: await loadSavedSessionHistoryForActive(draft?.session.id ?? null),
      });
      setConnectorPreview(preview);
      if (preview.kind === "errors-only") {
        setConnectorInboxStatus({
          tone: "error",
          message: `${file.displayName}: ${preview.invalidLineCount}개 라인이 파싱에 실패했습니다.`,
        });
      } else if (preview.kind === "empty") {
        setConnectorInboxStatus({
          tone: "error",
          message: `${file.displayName}: 유효한 이벤트가 없습니다.`,
        });
      } else {
        setConnectorInboxStatus({
          tone: "info",
          message: `${file.displayName} loaded · ${preview.headline}`,
        });
      }
    } catch (error) {
      setConnectorInboxSelectedPath(null);
      if (error instanceof ConnectorInboxUnavailableError) {
        setConnectorInboxStatus({ tone: "error", message: error.message });
      } else {
        setConnectorInboxStatus({
          tone: "error",
          message: error instanceof Error ? error.message : "Inbox 파일 읽기 실패",
        });
      }
    } finally {
      setConnectorInboxBusy(false);
    }
  }

  async function handleConnectorJsonlImportToReview() {
    if (!draft) {
      setStatus({ tone: "error", message: "활성 세션이 없습니다. 소스에서 가져오거나 새 세션을 만드세요." });
      return;
    }
    const preview =
      connectorPreview ??
      buildConnectorJsonlPreviewWithHistory(body, {
        activeSession: sessionView,
        savedSessions: await loadSavedSessionHistoryForActive(draft?.session.id ?? null),
      });
    if (preview.kind === "empty" || preview.kind === "errors-only") {
      setStatus({
        tone: "error",
        message: "유효한 이벤트가 없습니다. Parse 후 오류 라인을 수정하거나 다른 파일을 가져오세요.",
      });
      return;
    }
    // Skip duplicates by default. The toggle flips us back to the full set
    // (which still flows through the normal Import Review accept / discard
    // flow — the user controls every event before it reaches Timeline).
    const eventsToImport = connectorIncludeDuplicates ? preview.events : preview.newEvents;
    if (eventsToImport.length === 0) {
      setStatus({
        tone: "error",
        message: "모든 이벤트가 이미 가져온 항목입니다. '중복 포함'을 활성화하거나 다른 파일을 선택하세요.",
      });
      return;
    }
    const candidates = normalizeConnectorEventBatch({
      projectId: draft.project.id,
      sessionId: draft.session.id,
      events: eventsToImport,
    });
    const merged = mergeConnectorCandidatesForReview(candidates);
    if (!merged) {
      setStatus({ tone: "error", message: "정규화된 후보가 없습니다." });
      return;
    }
    const sourceImportSummary = buildConnectorSourceImportSummary(preview);
    beginPendingReview(merged, "connector-jsonl", {
      newEventCount: preview.newEventCount,
      duplicateSkippedCount: connectorIncludeDuplicates ? 0 : preview.duplicateEventCount,
      duplicateIncludedCount: connectorIncludeDuplicates ? preview.duplicateEventCount : 0,
      invalidLineCount: preview.invalidLineCount,
      includeDuplicates: connectorIncludeDuplicates,
      currentSessionDuplicateCount: preview.currentSessionDuplicateCount,
      savedSessionDuplicateCount: preview.savedSessionDuplicateCount,
      inBatchDuplicateCount: preview.inBatchDuplicateCount,
      savedSessionHistoryAvailable: preview.savedSessionHistoryAvailable,
      sourceImportSummary,
    });
    const skipped = preview.duplicateEventCount;
    const skipMessage =
      !connectorIncludeDuplicates && skipped > 0
        ? ` (중복 ${skipped}개 제외)`
        : connectorIncludeDuplicates && skipped > 0
          ? ` (중복 ${skipped}개 포함)`
          : "";
    setStatus({
      tone: "info",
      message: `'${merged.source.title}' 후보를 Import Review에서 확인하세요${skipMessage}.`,
    });
    onClose?.();
  }

  function handleRemove(importId: string) {
    removeImport(importId);
    setStatus({ tone: "info", message: "가져온 소스를 제거했습니다." });
  }

  return (
    <div className={`import-panel ${variant === "embedded" ? "is-embedded" : ""}`.trim()}>
      <div className="import-header">
        <div>
          <h2>소스 가져오기</h2>
          <p>메모, URL, AI 대화를 정규화해 현재 세션의 소스와 이벤트로 저장합니다.</p>
        </div>
        <div className="import-header-meta">
          <Badge tone="green">실제 세션</Badge>
          {onClose ? (
            <Button icon={X} onClick={onClose} aria-label="가져오기 패널 닫기" title="가져오기 패널 닫기" />
          ) : null}
        </div>
      </div>
      <div className="import-kind-tabs">
        <KindTab active={kind === "note"} icon={FileText} label="메모" onClick={() => setKind("note")} />
        <KindTab active={kind === "url"} icon={Globe} label="URL" onClick={() => setKind("url")} />
        <KindTab active={kind === "ai"} icon={Bot} label="AI 대화" onClick={() => setKind("ai")} />
        <KindTab active={kind === "git"} icon={GitCommit} label="Git diff" onClick={() => setKind("git")} />
        <KindTab
          active={kind === "connector"}
          icon={Layers}
          label="Connector JSONL"
          onClick={() => setKind("connector")}
        />
      </div>
      <div className="import-form">
        <label>
          제목 <small>(선택)</small>
          <input
            placeholder={kind === "url" ? "screenpipe 조사" : "포지셔닝 메모"}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {kind === "url" ? (
          <label>
            URL
            <input
              placeholder="https://github.com/mediar-ai/screenpipe"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
        ) : null}
        {kind === "ai" ? (
          <>
            <label>
              AI 플랫폼
              <select value={platform} onChange={(event) => setPlatform(event.target.value as AiTranscriptPlatform)}>
                <option value="claude">Claude</option>
                <option value="chatgpt">ChatGPT</option>
                <option value="codex">Codex</option>
                <option value="other">Other AI Chat</option>
              </select>
            </label>
            {platform === "chatgpt" ? (
              <p className="import-privacy-note">
                <small>
                  대화 텍스트를 붙여넣거나, ChatGPT <b>데이터 내보내기</b>의 conversations.json 내용을 그대로 붙여넣을 수 있습니다. Mori는 사용자가 직접 붙여넣은 파일만 읽습니다.
                </small>
                {body.trim() && isChatGptExport(body) ? (
                  <Badge tone="green">내보내기 파일 감지됨 · 메시지를 구조적으로 추출합니다</Badge>
                ) : null}
              </p>
            ) : null}
            <p className="import-privacy-note">
              <small>
                수동 붙여넣기 전용. Claude/ChatGPT/Codex 직접 연동은 계획 단계입니다. 현재 Mori는 브라우저 탭이나 앱을 자동 스캔하지 않습니다.
              </small>
            </p>
          </>
        ) : null}
        {kind === "git" ? (
          <>
            <div className="git-fetch-card">
              <div className="git-fetch-header">
                <strong>리포지토리에서 가져오기</strong>
                <Badge tone={desktopRuntime ? "green" : "gray"}>
                  {desktopRuntime ? "Tauri 데스크톱" : "데스크톱 필요"}
                </Badge>
              </div>
              <p className="git-fetch-help">
                명시적으로 입력한 리포지토리 경로에서 <code>git diff</code>를 실행합니다. Mori는 디렉터리를
                자동으로 스캔하지 않으며, 입력한 경로 외에는 어떤 파일도 읽지 않습니다.
              </p>
              <div className="git-fetch-grid">
                {repositorySettings.repositories.length ? (
                  <label>
                    저장된 리포지토리
                    <select
                      className="git-fetch-select"
                      value={selectedRepoId}
                      onChange={(event) => handleSelectRepository(event.target.value)}
                    >
                      <option value="">(직접 입력)</option>
                      {repositorySettings.repositories.map((repo) => (
                        <option key={repo.id} value={repo.id}>
                          {formatRepoOption(repo)}
                        </option>
                      ))}
                    </select>
                    {selectedRepoId ? (
                      <RepoVerificationHint
                        repo={repositorySettings.repositories.find((entry) => entry.id === selectedRepoId)}
                      />
                    ) : null}
                  </label>
                ) : (
                  <p className="git-fetch-help">
                    저장된 리포지토리가 없습니다. 아래에 경로를 직접 입력하거나 찾아보기로 선택하세요.
                  </p>
                )}
                <label>
                  리포지토리 경로
                  <div className="git-fetch-path-row">
                    <input
                      placeholder="C:\\dev\\mori"
                      value={repoPath}
                      onChange={(event) => {
                        setRepoPath(event.target.value);
                        setSelectedRepoId("");
                      }}
                    />
                    <Button
                      icon={FolderOpen}
                      onClick={() => handlePickRepository()}
                      disabled={!desktopRuntime || picking}
                      title={desktopRuntime ? "기본 폴더 선택기 열기" : "기본 선택기는 Tauri 앱에서만 사용 가능합니다"}
                    >
                      {picking ? "..." : "찾아보기"}
                    </Button>
                  </div>
                </label>
                <label>
                  Range <small>(예: HEAD, HEAD~1..HEAD, main..feature)</small>
                  <input
                    placeholder="HEAD"
                    value={repoRange}
                    onChange={(event) => setRepoRange(event.target.value)}
                  />
                </label>
                <label className="git-fetch-toggle">
                  <input
                    type="checkbox"
                    checked={staged}
                    onChange={(event) => setStaged(event.target.checked)}
                  />
                  <span>--staged (인덱스의 변경분만)</span>
                </label>
                <div className="git-fetch-actions">
                  <Button
                    icon={Download}
                    onClick={() => handleFetchGitDiff()}
                    disabled={fetching || !desktopRuntime}
                  >
                    {fetching ? "가져오는 중..." : "Git Diff 가져오기"}
                  </Button>
                </div>
              </div>
            </div>
            <label>
              출처 <small>(선택, fetch 시 자동 채워짐)</small>
              <input
                placeholder="HEAD~1..HEAD"
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
              />
            </label>
          </>
        ) : null}
        {kind === "connector" ? (
          <ConnectorJsonlInbox
            available={connectorInboxAvailable}
            inbox={connectorInbox}
            selectedPath={connectorInboxSelectedPath}
            busy={connectorInboxBusy}
            status={connectorInboxStatus}
            onRefresh={() => handleRefreshConnectorInbox()}
            onLoadFile={(file) => handleLoadConnectorInboxFile(file)}
          />
        ) : null}
        {kind === "connector" ? (
          <ConnectorJsonlPrivacyNote />
        ) : null}
        <label className="import-body">
          {kind === "url"
            ? "발췌 / 메모 (선택)"
            : kind === "ai"
              ? "대화 전문"
              : kind === "git"
                ? "Unified Git diff 텍스트"
                : kind === "connector"
                  ? "Connector JSONL (한 줄에 한 이벤트)"
                  : "메모 본문"}
          <textarea
            placeholder={
              kind === "ai"
                ? "User: ...\n\nAssistant: ..."
                : kind === "url"
                  ? "관련 문장을 옮겨두면 검색과 분석에 도움이 됩니다."
                  : kind === "git"
                    ? "diff --git a/src/lib/foo.ts b/src/lib/foo.ts\n@@ -1,4 +1,5 @@\n ..."
                    : kind === "connector"
                      ? '{"id":"evt-1","connectorId":"claudeCodeHook","kind":"prompt_submitted",...}'
                      : "Mori는 work-flow reconstruction, not searchable memory."
            }
            rows={kind === "ai" || kind === "git" || kind === "connector" ? 8 : 4}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              if (kind === "connector") {
                // Clear stale preview as soon as the user edits — they must
                // explicitly click Parse to refresh it. This prevents the UI
                // from claiming a preview that doesn't match the current text.
                if (connectorPreview) setConnectorPreview(null);
                // The textarea no longer reflects the loaded file; drop the
                // "selected from inbox" tag so the UI doesn't lie about it.
                if (connectorInboxSelectedPath) setConnectorInboxSelectedPath(null);
              }
            }}
          />
        </label>
        {kind === "connector" ? (
          <ConnectorJsonlPreviewCard
            preview={connectorPreview}
            includeDuplicates={connectorIncludeDuplicates}
            onIncludeDuplicatesChange={setConnectorIncludeDuplicates}
          />
        ) : null}
      </div>
      <div className="import-actions">
        {kind === "connector" ? (
          <ConnectorJsonlActions
            preview={connectorPreview}
            canImport={canImport}
            includeDuplicates={connectorIncludeDuplicates}
            onPreview={() => handlePreviewConnectorJsonl()}
            onImport={() => handleConnectorJsonlImportToReview()}
          />
        ) : (
          <Button variant="primary" icon={Plus} onClick={handleAdd} disabled={!canImport}>
            세션에 추가
          </Button>
        )}
        {status ? <span className={`import-status tone-${status.tone}`}>{status.message}</span> : null}
      </div>
      {imports.length ? (
        <div className="import-history">
          <h3>가져온 소스 {imports.length}건</h3>
          <ul>
            {imports.map((entry) => (
              <li key={entry.id}>
                <Badge
                  tone={
                    entry.source.kind === "browser"
                      ? "cyan"
                      : entry.source.kind === "aiConversation"
                        ? "purple"
                        : entry.source.kind === "gitDiff"
                          ? "blue"
                          : "gray"
                  }
                >
                  {entry.source.kind}
                </Badge>
                <strong>{entry.source.title}</strong>
                <small>{formatDateTime(entry.savedAt)}</small>
                <Button icon={Trash2} onClick={() => handleRemove(entry.id)} aria-label="가져온 소스 제거" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function KindTab({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof FileText; label: string; onClick: () => void }) {
  return (
    <button className={`import-kind-tab ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

export function formatRepoOption(repo: import("../../lib/repositories").RepositoryConfig): string {
  const verification = repo.verification;
  if (!verification || verification.status === "unverified") {
    return `${repo.label} · 미검증 — ${repo.path}`;
  }
  if (verification.status === "failed") {
    return `${repo.label} · 검증 실패 — ${repo.path}`;
  }
  const branch = verification.currentBranch ?? "분리됨";
  const sha = verification.shortHeadCommit ?? verification.headCommit?.slice(0, 7) ?? "";
  const dirty = verification.isDirty ? " · 수정됨" : "";
  const freshness = getRepositoryVerificationFreshness(verification);
  const staleMarker = freshness.isStale ? " · 오래됨" : "";
  const age = freshness.ageLabel ? ` (${freshness.ageLabel})` : "";
  return `${repo.label} · ${branch} ${sha}${dirty}${staleMarker}${age} — ${repo.path}`;
}

function RepoVerificationHint({ repo }: { repo: import("../../lib/repositories").RepositoryConfig | undefined }) {
  if (!repo) return null;
  const verification = repo.verification;
  if (!verification || verification.status === "unverified") {
    return (
      <small className="git-fetch-help">
        이 리포지토리는 아직 검증되지 않았습니다. Git diff를 가져오면 branch/SHA 정보가 함께 갱신됩니다.
      </small>
    );
  }
  if (verification.status === "failed") {
    return (
      <small className="git-fetch-help" role="alert">
        마지막 verify 실패: {verification.error ?? "알 수 없는 오류"}
      </small>
    );
  }
  const branch = verification.currentBranch ?? "분리됨";
  const sha = verification.shortHeadCommit ?? verification.headCommit?.slice(0, 7) ?? "";
  const dirty = verification.isDirty ? " · 수정됨" : "";
  const freshness = getRepositoryVerificationFreshness(verification);
  const stalePrefix = freshness.isStale ? "오래됨 · " : "검증됨 · ";
  const age = freshness.ageLabel ? ` (${freshness.ageLabel})` : "";
  return (
    <small className={`git-fetch-help${freshness.isStale ? " tone-warn" : ""}`}>
      {stalePrefix}{branch} · {sha}{dirty}{age}
      {freshness.isStale ? " — 다시 검증하거나 Fetch해서 갱신하세요." : ""}
    </small>
  );
}

function ConnectorJsonlInbox({
  available,
  inbox,
  selectedPath,
  busy,
  status,
  onRefresh,
  onLoadFile,
}: {
  available: boolean;
  inbox: ConnectorInboxListing | null;
  selectedPath: string | null;
  busy: boolean;
  status: { tone: "info" | "error"; message: string } | null;
  onRefresh: () => void;
  onLoadFile: (file: ConnectorInboxFile) => void;
}) {
  if (!available) {
    return (
      <div className="connector-jsonl-inbox is-browser" role="region" aria-label="Connector 수신함">
        <header>
          <strong>커넥터 Inbox</strong>
          <Badge tone="gray">데스크톱 전용</Badge>
        </header>
        <p>
          로컬 JSONL 파일을 자동으로 불러오는 기능은 Tauri 데스크톱 앱에서만 동작합니다. 브라우저
          모드에서는 아래 textarea에 JSONL 내용을 직접 붙여넣어 동일한 Parse / Preview 흐름을
          사용할 수 있습니다.
        </p>
      </div>
    );
  }
  return (
    <div className="connector-jsonl-inbox" role="region" aria-label="Connector 수신함">
      <header>
        <strong>커넥터 Inbox</strong>
        <span>
          Mori는 <code>~/.mori/connectors/</code> 아래의 파일만 읽습니다. 폴더를 자동으로
          감시하지 않으며, 새로고침을 누를 때만 목록을 다시 가져옵니다.
        </span>
        <Button onClick={onRefresh} disabled={busy}>
          {busy ? "새로고침 중..." : "Inbox 새로고침"}
        </Button>
      </header>
      {status ? (
        <p className={`connector-jsonl-inbox-status tone-${status.tone}`}>{status.message}</p>
      ) : null}
      {inbox ? (
        inbox.files.length === 0 ? (
          <p className="connector-jsonl-inbox-empty">
            {inbox.rootExists
              ? "Inbox는 비어 있습니다. Claude Code hook 또는 Codex CLI wrapper가 JSONL 파일을 생성하면 여기 표시됩니다."
              : `Mori는 다음 경로에서 connector JSONL을 찾습니다: ${inbox.rootPath}. 해당 디렉터리를 만들고 hook/wrapper 결과 파일을 저장하세요.`}
          </p>
        ) : (
          <ul className="connector-jsonl-inbox-list">
            {inbox.files.map((file) => {
              const isSelected = selectedPath === file.path;
              return (
                <li key={file.path}>
                  <button
                    type="button"
                    className={`connector-jsonl-inbox-row ${isSelected ? "is-selected" : ""}`}
                    onClick={() => onLoadFile(file)}
                    disabled={busy}
                    title={file.path}
                  >
                    <div className="connector-jsonl-inbox-row-main">
                      <Badge tone="purple">{formatConnectorFamily(file.connectorFamily)}</Badge>
                      <strong>{file.displayName}</strong>
                    </div>
                    <div className="connector-jsonl-inbox-row-meta">
                      <span>{formatInboxFileSize(file.sizeBytes)}</span>
                      <span>{formatInboxModifiedAt(file.modifiedAt)}</span>
                      <small>{file.relativePath}</small>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

function ConnectorSourceImportSummaryBlock({
  summary,
}: {
  summary: ConnectorSourceImportSummary;
}) {
  // The block lives at the top of the preview card so users see "what
  // this import means for them" before they read counts and bucket lists.
  // We render every status with its own copy + suggested action so the UI
  // is never silent about a re-import.
  if (summary.status === "unknown") return null;
  const tone = getConnectorSourceImportBadgeTone(summary);
  const heading = getConnectorSourceImportHeading(summary);
  const actionLabel = getConnectorSourceImportActionLabel(summary);
  return (
    <section
      className={`connector-jsonl-source-summary tone-${summary.status}`}
      role="status"
      aria-label="Connector 소스 가져오기 요약"
    >
      <header className="connector-jsonl-source-summary-head">
        <Badge tone={tone}>{describeConnectorSourceImportBadge(summary)}</Badge>
        <strong>{heading}</strong>
      </header>
      <ul className="connector-jsonl-source-summary-counts">
        <li>새 이벤트: <strong>{summary.newEventCount}</strong></li>
        <li>현재 세션 중복: <strong>{summary.currentSessionDuplicateCount}</strong></li>
        <li>저장 세션 중복: <strong>{summary.savedSessionDuplicateCount}</strong></li>
        <li>파일 내부 중복: <strong>{summary.inBatchDuplicateCount}</strong></li>
        <li>잘못된 라인: <strong>{summary.invalidLineCount}</strong></li>
      </ul>
      {summary.matchedSavedSessions.length > 0 ? (
        <p className="connector-jsonl-source-summary-matched">
          이미 가져온 저장 세션:{" "}
          {summary.matchedSavedSessions
            .map((entry) => entry.title ?? entry.sessionId)
            .slice(0, 3)
            .join(", ")}
          {summary.matchedSavedSessions.length > 3
            ? ` 외 ${summary.matchedSavedSessions.length - 3}건`
            : ""}
        </p>
      ) : null}
      <p className="connector-jsonl-source-summary-detail">{summary.detailMessage}</p>
      <p className="connector-jsonl-source-summary-action">
        <small>제안된 동작: <strong>{actionLabel}</strong></small>
      </p>
      <p className="connector-jsonl-source-summary-privacy" role="note">
        Mori는 로컬에 저장된 Mori 세션만 참고합니다. 클라우드 계정도, 백그라운드 폴더 감시도 없습니다.
        connectorEventId 가 없는 옛 import는 소급해서 중복으로 표시되지 않습니다.
      </p>
    </section>
  );
}

function getConnectorSourceImportHeading(summary: ConnectorSourceImportSummary): string {
  switch (summary.status) {
    case "new":
      return "새 import";
    case "partialReimport":
      return "부분 재import 감지됨";
    case "duplicateOnly":
      return "이미 가져온 항목";
    case "historyUnavailable":
      return "저장 세션 기록 사용 불가";
    case "invalidOnly":
      return "잘못된 라인만 발견됨";
    case "unknown":
    default:
      return "요약 없음";
  }
}

function getConnectorSourceImportActionLabel(summary: ConnectorSourceImportSummary): string {
  switch (summary.defaultAction) {
    case "importNewEvents":
      return summary.duplicateEventCount > 0
        ? `새 이벤트 ${summary.newEventCount}개만 Import Review로 전달 (중복 ${summary.duplicateEventCount}개 제외)`
        : `새 이벤트 ${summary.newEventCount}개를 Import Review로 전달`;
    case "reviewDuplicatesOptional":
      return "'중복 포함' 토글 후 다시 Import 또는 매칭된 저장 세션 확인";
    case "noNewEvents":
      return "추가로 가져올 이벤트가 없습니다";
    case "fixInvalidLines":
      return "잘못된 라인을 수정한 뒤 다시 시도하세요";
    case "historyUnavailableReview":
      return "Import Review에서 직접 확인 후 진행하세요";
    default:
      return "—";
  }
}

function ConnectorJsonlPrivacyNote() {
  return (
    <div className="connector-jsonl-privacy" role="note">
      <strong>Connector JSONL · 명시적 import 전용</strong>
      <ul>
        <li>붙여넣거나 선택한 JSONL 내용만 처리합니다.</li>
        <li>Mori는 폴더를 자동으로 감시하지 않습니다.</li>
        <li>Mori는 터미널 히스토리를 자동으로 읽지 않습니다.</li>
        <li>Claude / Codex 계정과 자동 동기화하지 않습니다.</li>
        <li>붙여넣은 텍스트는 Import Review를 거쳐야 세션에 들어옵니다.</li>
      </ul>
    </div>
  );
}

function ConnectorJsonlPreviewCard({
  preview,
  includeDuplicates,
  onIncludeDuplicatesChange,
}: {
  preview: ConnectorJsonlPreview | null;
  includeDuplicates: boolean;
  onIncludeDuplicatesChange: (next: boolean) => void;
}) {
  if (!preview || preview.kind === "empty") return null;
  const timeRange =
    preview.earliestOccurredAt && preview.latestOccurredAt
      ? `${formatDateTime(preview.earliestOccurredAt)} → ${formatDateTime(
          preview.latestOccurredAt,
        )}`
      : "—";
  const hasDuplicates = preview.duplicateEventCount > 0;
  const allDuplicate = hasDuplicates && preview.newEventCount === 0;
  const summary = buildConnectorSourceImportSummary(preview);
  return (
    <section
      className={`connector-jsonl-preview tone-${preview.kind}`}
      aria-label="Connector JSONL 미리보기"
    >
      <header>
        <strong>{preview.headline}</strong>
        <span>{preview.totalLines}줄 · {preview.skippedBlankLines}줄 건너뜀</span>
      </header>
      <ConnectorSourceImportSummaryBlock summary={summary} />

      {hasDuplicates ? (
        <div className="connector-jsonl-duplicate-row" role="status">
          <span className="connector-jsonl-duplicate-counts">
            <Badge tone="green">새 이벤트 · {preview.newEventCount}</Badge>
            {preview.currentSessionDuplicateCount > 0 ? (
              <Badge tone="orange">현재 세션에 이미 있음 · {preview.currentSessionDuplicateCount}</Badge>
            ) : null}
            {preview.savedSessionDuplicateCount > 0 ? (
              <Badge tone="orange">저장 세션에 이미 있음 · {preview.savedSessionDuplicateCount}</Badge>
            ) : null}
            {preview.inBatchDuplicateCount > 0 ? (
              <Badge tone="orange">이 파일에서 반복됨 · {preview.inBatchDuplicateCount}</Badge>
            ) : null}
            {preview.invalidLineCount > 0 ? (
              <Badge tone="red">잘못된 줄 · {preview.invalidLineCount}</Badge>
            ) : null}
          </span>
          <label className="connector-jsonl-duplicate-toggle">
            <input
              type="checkbox"
              checked={includeDuplicates}
              onChange={(event) => onIncludeDuplicatesChange(event.target.checked)}
              disabled={allDuplicate && preview.duplicateEventCount === 0}
            />
            <span>
              중복 포함
              <small>
                {includeDuplicates
                  ? "중복 이벤트도 Import Review에 포함됩니다. Timeline에 같은 카드가 반복될 수 있습니다."
                  : "Mori가 connector event ID로 이미 가져온 이벤트를 감지했습니다. 기본적으로 중복은 Import Review에서 제외됩니다."}
              </small>
            </span>
          </label>
        </div>
      ) : null}
      {!preview.savedSessionHistoryAvailable && preview.kind !== "errors-only" ? (
        <p className="connector-jsonl-history-note" role="note">
          저장 세션 기록을 이 모드에서는 사용할 수 없어, 현재 세션 + 이 파일 내부 중복만 검사했습니다.
        </p>
      ) : null}
      {preview.matchedSavedSessions.length > 0 ? (
        <p className="connector-jsonl-history-note" role="note">
          이미 가져온 저장 세션:{' '}
          {preview.matchedSavedSessions
            .map((entry) => entry.title ?? entry.sessionId)
            .slice(0, 3)
            .join(", ")}
          {preview.matchedSavedSessions.length > 3
            ? ` 외 ${preview.matchedSavedSessions.length - 3}건`
            : ""}
        </p>
      ) : null}
      <dl>
        <div>
          <dt>유효 이벤트</dt>
          <dd>{preview.validEventCount}</dd>
        </div>
        <div>
          <dt>잘못된 줄</dt>
          <dd>{preview.invalidLineCount}</dd>
        </div>
        <div>
          <dt>커넥터</dt>
          <dd>{preview.connectorIds.length === 0 ? "—" : preview.connectorIds.join(", ")}</dd>
        </div>
        <div>
          <dt>이벤트 종류</dt>
          <dd>{preview.eventKinds.length === 0 ? "—" : preview.eventKinds.join(", ")}</dd>
        </div>
        <div>
          <dt>시간 범위</dt>
          <dd>{timeRange}</dd>
        </div>
        <div>
          <dt>프로젝트 경로</dt>
          <dd>{preview.projectPaths.length === 0 ? "—" : preview.projectPaths.join(", ")}</dd>
        </div>
      </dl>
      {preview.buckets.length > 0 ? (
        <ul className="connector-jsonl-bucket-list">
          {preview.buckets.map((bucket) => (
            <li key={`${bucket.connectorId}::${bucket.externalSessionId ?? "unscoped"}`}>
              <strong>{bucket.label}</strong>
              <span>이벤트 {bucket.eventCount}개</span>
              <small>
                {formatTime(bucket.startedAt)} → {formatTime(bucket.endedAt)}
              </small>
            </li>
          ))}
        </ul>
      ) : null}
      {preview.warnings.length > 0 ? (
        <ul className="connector-jsonl-warning-list">
          {preview.warnings.map((warning) => (
            <li key={warning.code}>
              <Badge tone="orange">{describeConnectorWarningCode(warning.code)}</Badge>
              <span>{warning.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {preview.errors.length > 0 ? (
        <details className="connector-jsonl-error-list">
          <summary>
            {preview.errors.length} parse error{preview.errors.length === 1 ? "" : "s"} · click to expand
          </summary>
          <ul>
            {preview.errors.slice(0, 25).map((error, index) => (
              <li key={`${error.line ?? error.index ?? index}-${error.field ?? "raw"}-${index}`}>
                <Badge tone="red">
                  line {error.line ?? (error.index !== undefined ? `[${error.index}]` : "?")}
                </Badge>
                <code>{error.field ?? "(parse)"}</code>
                <span>{error.message}</span>
              </li>
            ))}
            {preview.errors.length > 25 ? (
              <li>
                <small>+ {preview.errors.length - 25} more — fix the listed lines and re-parse.</small>
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function ConnectorJsonlActions({
  preview,
  canImport,
  includeDuplicates,
  onPreview,
  onImport,
}: {
  preview: ConnectorJsonlPreview | null;
  canImport: boolean;
  includeDuplicates: boolean;
  onPreview: () => void;
  onImport: () => void;
}) {
  // The session-aware preview marks `canImport: false` when every event is
  // a duplicate. The Include-duplicates toggle re-enables the button in
  // that case because the user has opted in to repeated Timeline cards.
  const previewBlocksImport =
    Boolean(preview) && !preview!.canImport && !(includeDuplicates && (preview?.events.length ?? 0) > 0);
  const canSendToReview = canImport && Boolean(preview) && !previewBlocksImport;
  return (
    <>
      <Button onClick={onPreview}>파싱 / 미리보기</Button>
      <Button
        variant="primary"
        icon={Plus}
        onClick={onImport}
        disabled={!canSendToReview}
        title={
          !canImport
            ? "세션이 없습니다."
            : !preview
              ? "먼저 파싱 / 미리보기를 실행하세요."
              : previewBlocksImport
                ? "모든 이벤트가 이미 가져온 항목입니다. '중복 포함'을 활성화하면 다시 가져올 수 있습니다."
                : includeDuplicates && (preview?.duplicateEventCount ?? 0) > 0
                  ? `${preview!.newEventCount}개 새 + ${preview!.duplicateEventCount}개 중복을 Import Review로 전달합니다.`
                  : (preview?.duplicateEventCount ?? 0) > 0
                    ? `${preview!.newEventCount}개 새 이벤트를 Import Review로 전달합니다 (중복 ${preview!.duplicateEventCount}개 제외).`
                    : "유효한 이벤트를 Import Review로 전달합니다."
        }
      >
        Import Review로 가져오기
      </Button>
    </>
  );
}

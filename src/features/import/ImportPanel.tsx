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
  normalizeAiConversationText,
  normalizeAiTranscript,
  normalizeGitDiff,
  normalizeManualNote,
  normalizeUrlSource,
  type AiTranscriptPlatform,
  type NormalizedImportCandidate,
} from "../../lib/import";
import {
  buildConnectorJsonlPreview,
  mergeConnectorCandidatesForReview,
  normalizeConnectorEventBatch,
  type ConnectorJsonlPreview,
} from "../../lib/connectors";
import { getRepositoryVerificationFreshness } from "../../lib/repositories";
import { useMoriSessionStore } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { selectActiveRepository, useMoriRepositoryStore } from "../../app/repositoryStore";
import { useMoriReviewStore } from "../../app/reviewStore";
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
  const draft = useMoriSessionStore((state) => state.draft);
  const imports = useMoriSessionStore((state) => state.imports);
  const addImport = useMoriSessionStore((state) => state.addImport);
  const removeImport = useMoriSessionStore((state) => state.removeImport);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const setSelectedEventId = useMoriAppStore((state) => state.setSelectedEventId);
  const startReview = useMoriReviewStore((state) => state.startReview);

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
  const repositorySettings = useMoriRepositoryStore((state) => state.settings);
  const selectRepository = useMoriRepositoryStore((state) => state.selectRepository);
  const markRepositoryUsed = useMoriRepositoryStore((state) => state.markRepositoryUsed);
  const refreshRepositoryMetadataAfterCapture = useMoriRepositoryStore(
    (state) => state.refreshRepositoryMetadataAfterCapture,
  );
  const activeRepository = useMoriRepositoryStore(selectActiveRepository);
  const [selectedRepoId, setSelectedRepoId] = useState<string>(activeRepository?.id ?? "");

  /** Live preview snapshot for the Connector JSONL tab; null until the user clicks Parse. */
  const [connectorPreview, setConnectorPreview] = useState<ConnectorJsonlPreview | null>(null);

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
            <p>세션을 시작하면 메모, URL, AI 대화를 Mori에 직접 가져올 수 있습니다.</p>
          </div>
          <Badge tone="gray">데모 세션</Badge>
        </div>
        <p className="import-help">
          현재 보이는 데이터는 데모용 모의 세션입니다. <b>Start Mori / Session Setup</b>에서 새 세션을 시작하면 가져온 소스가
          이 화면에 실제로 누적됩니다.
        </p>
        <div className="import-actions">
          <Button variant="primary" icon={Plus} onClick={() => setCurrentView("start")}>
            세션 시작으로 이동
          </Button>
        </div>
      </div>
    );
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
        message: error instanceof Error ? error.message : "Folder picker failed.",
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
        message: error instanceof Error ? error.message : "Git diff capture failed.",
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
      startReview(candidate, origin);
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

  function handlePreviewConnectorJsonl() {
    if (!body.trim()) {
      setStatus({ tone: "error", message: "Connector JSONL을 붙여넣은 뒤 Parse를 누르세요." });
      setConnectorPreview(null);
      return;
    }
    const preview = buildConnectorJsonlPreview(body);
    setConnectorPreview(preview);
    if (preview.kind === "empty") {
      setStatus({ tone: "error", message: "유효한 라인이 없습니다." });
    } else if (preview.kind === "errors-only") {
      setStatus({
        tone: "error",
        message: `${preview.invalidLineCount}개 라인이 파싱에 실패했습니다. 라인 번호를 확인하세요.`,
      });
    } else {
      setStatus({ tone: "ok", message: preview.headline });
    }
  }

  function handleConnectorJsonlImportToReview() {
    if (!draft) {
      setStatus({ tone: "error", message: "세션이 없습니다. Start Session에서 새 세션을 시작하세요." });
      return;
    }
    const preview = connectorPreview ?? buildConnectorJsonlPreview(body);
    if (!preview.canImport || preview.events.length === 0) {
      setStatus({
        tone: "error",
        message: "유효한 이벤트가 없습니다. Parse 후 오류 라인을 수정하거나 다른 파일을 가져오세요.",
      });
      return;
    }
    const candidates = normalizeConnectorEventBatch({
      projectId: draft.project.id,
      sessionId: draft.session.id,
      events: preview.events,
    });
    const merged = mergeConnectorCandidatesForReview(candidates);
    if (!merged) {
      setStatus({ tone: "error", message: "정규화된 후보가 없습니다." });
      return;
    }
    startReview(merged, "connector-jsonl");
    setStatus({
      tone: "info",
      message: `'${merged.source.title}' 후보를 Import Review에서 확인하세요.`,
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
            placeholder={kind === "url" ? "screenpipe 조사" : "Positioning note"}
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
                    저장된 리포지토리가 없습니다. <b>Settings → Repositories</b>에서 추가하거나 아래에 경로를 직접 입력하세요.
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
                      title={desktopRuntime ? "Open native folder picker" : "Native picker requires the Tauri app"}
                    >
                      {picking ? "..." : "Browse"}
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
                    {fetching ? "가져오는 중..." : "Fetch Git Diff"}
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
              }
            }}
          />
        </label>
        {kind === "connector" ? (
          <ConnectorJsonlPreviewCard preview={connectorPreview} />
        ) : null}
      </div>
      <div className="import-actions">
        {kind === "connector" ? (
          <ConnectorJsonlActions
            preview={connectorPreview}
            canImport={canImport}
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
                <small>{new Date(entry.savedAt).toLocaleString()}</small>
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

export function formatRepoOption(repo: import("../../lib/repositories").MoriRepositoryConfig): string {
  const verification = repo.verification;
  if (!verification || verification.status === "unverified") {
    return `${repo.label} · unverified — ${repo.path}`;
  }
  if (verification.status === "failed") {
    return `${repo.label} · verify failed — ${repo.path}`;
  }
  const branch = verification.currentBranch ?? "detached";
  const sha = verification.shortHeadCommit ?? verification.headCommit?.slice(0, 7) ?? "";
  const dirty = verification.isDirty ? " · dirty" : "";
  const freshness = getRepositoryVerificationFreshness(verification);
  const staleMarker = freshness.isStale ? " · stale" : "";
  const age = freshness.ageLabel ? ` (${freshness.ageLabel})` : "";
  return `${repo.label} · ${branch} ${sha}${dirty}${staleMarker}${age} — ${repo.path}`;
}

function RepoVerificationHint({ repo }: { repo: import("../../lib/repositories").MoriRepositoryConfig | undefined }) {
  if (!repo) return null;
  const verification = repo.verification;
  if (!verification || verification.status === "unverified") {
    return (
      <small className="git-fetch-help">
        이 리포지토리는 아직 검증되지 않았습니다. Settings에서 Verify를 실행하면 branch/SHA가 표시됩니다.
      </small>
    );
  }
  if (verification.status === "failed") {
    return (
      <small className="git-fetch-help" role="alert">
        마지막 verify 실패: {verification.error ?? "unknown error"}
      </small>
    );
  }
  const branch = verification.currentBranch ?? "detached";
  const sha = verification.shortHeadCommit ?? verification.headCommit?.slice(0, 7) ?? "";
  const dirty = verification.isDirty ? " · dirty" : "";
  const freshness = getRepositoryVerificationFreshness(verification);
  const stalePrefix = freshness.isStale ? "Stale · " : "Verified · ";
  const age = freshness.ageLabel ? ` (${freshness.ageLabel})` : "";
  return (
    <small className={`git-fetch-help${freshness.isStale ? " tone-warn" : ""}`}>
      {stalePrefix}{branch} · {sha}{dirty}{age}
      {freshness.isStale ? " — Re-verify or fetch to refresh." : ""}
    </small>
  );
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

function ConnectorJsonlPreviewCard({ preview }: { preview: ConnectorJsonlPreview | null }) {
  if (!preview || preview.kind === "empty") return null;
  const timeRange =
    preview.earliestOccurredAt && preview.latestOccurredAt
      ? `${new Date(preview.earliestOccurredAt).toLocaleString()} → ${new Date(
          preview.latestOccurredAt,
        ).toLocaleString()}`
      : "—";
  return (
    <section
      className={`connector-jsonl-preview tone-${preview.kind}`}
      aria-label="Connector JSONL preview"
    >
      <header>
        <strong>{preview.headline}</strong>
        <span>{preview.totalLines} lines · {preview.skippedBlankLines} skipped</span>
      </header>
      <dl>
        <div>
          <dt>Valid events</dt>
          <dd>{preview.validEventCount}</dd>
        </div>
        <div>
          <dt>Invalid lines</dt>
          <dd>{preview.invalidLineCount}</dd>
        </div>
        <div>
          <dt>Connectors</dt>
          <dd>{preview.connectorIds.length === 0 ? "—" : preview.connectorIds.join(", ")}</dd>
        </div>
        <div>
          <dt>Event kinds</dt>
          <dd>{preview.eventKinds.length === 0 ? "—" : preview.eventKinds.join(", ")}</dd>
        </div>
        <div>
          <dt>Time range</dt>
          <dd>{timeRange}</dd>
        </div>
        <div>
          <dt>Project paths</dt>
          <dd>{preview.projectPaths.length === 0 ? "—" : preview.projectPaths.join(", ")}</dd>
        </div>
      </dl>
      {preview.buckets.length > 0 ? (
        <ul className="connector-jsonl-bucket-list">
          {preview.buckets.map((bucket) => (
            <li key={`${bucket.connectorId}::${bucket.externalSessionId ?? "unscoped"}`}>
              <strong>{bucket.label}</strong>
              <span>{bucket.eventCount} events</span>
              <small>
                {new Date(bucket.startedAt).toLocaleTimeString()} → {new Date(bucket.endedAt).toLocaleTimeString()}
              </small>
            </li>
          ))}
        </ul>
      ) : null}
      {preview.warnings.length > 0 ? (
        <ul className="connector-jsonl-warning-list">
          {preview.warnings.map((warning) => (
            <li key={warning.code}>
              <Badge tone="orange">{warning.code}</Badge>
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
  onPreview,
  onImport,
}: {
  preview: ConnectorJsonlPreview | null;
  canImport: boolean;
  onPreview: () => void;
  onImport: () => void;
}) {
  const canSendToReview = canImport && Boolean(preview?.canImport);
  return (
    <>
      <Button onClick={onPreview}>Parse / Preview</Button>
      <Button
        variant="primary"
        icon={Plus}
        onClick={onImport}
        disabled={!canSendToReview}
        title={
          !canImport
            ? "세션이 없습니다."
            : !preview
              ? "먼저 Parse / Preview를 실행하세요."
              : preview.canImport
                ? "유효한 이벤트를 Import Review로 전달합니다."
                : "유효한 이벤트가 없습니다."
        }
      >
        Import to Review
      </Button>
    </>
  );
}

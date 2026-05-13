import { Bot, Download, FileText, FolderOpen, GitCommit, Globe, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  GitDiffParseError,
  normalizeAiConversationText,
  normalizeGitDiff,
  normalizeManualNote,
  normalizeUrlSource,
  type NormalizedImportCandidate,
} from "../../lib/import";
import { getRepositoryVerificationFreshness } from "../../lib/repositories";
import { useMoriSessionStore } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { selectActiveRepository, useMoriRepositoryStore } from "../../app/repositoryStore";
import { isTauriRuntime, pickRepositoryDirectory, runGitDiff } from "../../lib/desktop";

type ImportKind = "note" | "url" | "ai" | "git";

type ImportStatus = { tone: "ok" | "error" | "info"; message: string } | null;

export function ImportPanel() {
  const draft = useMoriSessionStore((state) => state.draft);
  const imports = useMoriSessionStore((state) => state.imports);
  const addImport = useMoriSessionStore((state) => state.addImport);
  const removeImport = useMoriSessionStore((state) => state.removeImport);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const setSelectedEventId = useMoriAppStore((state) => state.setSelectedEventId);

  const [kind, setKind] = useState<ImportKind>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [provider, setProvider] = useState("Claude");
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
    return normalizeAiConversationText({
      ...base,
      title: title.trim() || undefined,
      provider: provider.trim() || undefined,
      text: body,
    });
  }

  function handleAdd() {
    const candidate = buildCandidate();
    if (!candidate) return;

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

  function handleRemove(importId: string) {
    removeImport(importId);
    setStatus({ tone: "info", message: "가져온 소스를 제거했습니다." });
  }

  return (
    <div className="import-panel">
      <div className="import-header">
        <div>
          <h2>소스 가져오기</h2>
          <p>메모, URL, AI 대화를 정규화해 현재 세션의 소스와 이벤트로 저장합니다.</p>
        </div>
        <Badge tone="green">실제 세션</Badge>
      </div>
      <div className="import-kind-tabs">
        <KindTab active={kind === "note"} icon={FileText} label="메모" onClick={() => setKind("note")} />
        <KindTab active={kind === "url"} icon={Globe} label="URL" onClick={() => setKind("url")} />
        <KindTab active={kind === "ai"} icon={Bot} label="AI 대화" onClick={() => setKind("ai")} />
        <KindTab active={kind === "git"} icon={GitCommit} label="Git diff" onClick={() => setKind("git")} />
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
          <label>
            제공자 <small>(선택)</small>
            <input
              placeholder="Claude / ChatGPT / Codex"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            />
          </label>
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
        <label className="import-body">
          {kind === "url"
            ? "발췌 / 메모 (선택)"
            : kind === "ai"
              ? "대화 전문"
              : kind === "git"
                ? "Unified Git diff 텍스트"
                : "메모 본문"}
          <textarea
            placeholder={
              kind === "ai"
                ? "User: ...\n\nAssistant: ..."
                : kind === "url"
                  ? "관련 문장을 옮겨두면 검색과 분석에 도움이 됩니다."
                  : kind === "git"
                    ? "diff --git a/src/lib/foo.ts b/src/lib/foo.ts\n@@ -1,4 +1,5 @@\n ..."
                    : "Mori는 work-flow reconstruction, not searchable memory."
            }
            rows={kind === "ai" || kind === "git" ? 8 : 4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
      </div>
      <div className="import-actions">
        <Button variant="primary" icon={Plus} onClick={handleAdd} disabled={!canImport}>
          세션에 추가
        </Button>
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

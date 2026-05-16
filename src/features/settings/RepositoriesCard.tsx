import {
  CheckCircle2,
  FolderOpen,
  FolderPlus,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SectionHeader } from "../../components/ui/SectionHeader";
import {
  deriveLabelFromPath,
  getRepositoryVerificationFreshness,
  type MoriRepositoryConfig,
  type RepositoryVerificationMetadata,
} from "../../lib/repositories";
import { summarizeRepositories } from "../../lib/settings/settingsStatus";

export function RepositoriesCard({
  repositories,
  desktopRuntime,
  defaultRepositoryId,
  verifyingId,
  onAdd,
  onPickDirectory,
  onRename,
  onSelect,
  onVerify,
  onClearVerification,
  onRemove,
}: {
  repositories: MoriRepositoryConfig[];
  desktopRuntime: boolean;
  defaultRepositoryId: string | null;
  verifyingId: string | null;
  onAdd: (input: { path: string; label?: string }) => void;
  onPickDirectory: () => Promise<string | null>;
  onRename: (id: string, label: string) => void;
  onSelect: (id: string) => void;
  onVerify: (id: string) => void;
  onClearVerification: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [pathInput, setPathInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const summary = summarizeRepositories(
    repositories.map((repo) => ({
      id: repo.id,
      isDefault: repo.id === defaultRepositoryId,
      verification: repo.verification,
    })),
  );

  async function handlePick() {
    if (!desktopRuntime) {
      setError("Native folder picker는 Tauri 데스크톱 앱에서만 사용할 수 있습니다.");
      return;
    }
    setError(null);
    setPicking(true);
    try {
      const path = await onPickDirectory();
      if (!path) return;
      setPathInput(path);
      if (!labelInput.trim()) setLabelInput(deriveLabelFromPath(path));
    } catch (err) {
      setError(err instanceof Error ? err.message : "폴더 선택에 실패했습니다.");
    } finally {
      setPicking(false);
    }
  }

  function handleAdd() {
    const path = pathInput.trim();
    if (!path) {
      setError("리포지토리 경로를 입력하거나 폴더를 선택하세요.");
      return;
    }
    onAdd({ path, label: labelInput.trim() || undefined });
    setPathInput("");
    setLabelInput("");
    setError(null);
  }

  return (
    <section className="settings-card" aria-label="Repositories">
      <header className="settings-card-head">
        <div>
          <h3>리포지토리</h3>
          <p>
            Mori는 사용자가 명시적으로 추가한 리포지토리 경로만 기억합니다. 디스크를 자동으로 스캔하지 않으며,
            저장된 경로는 Git diff 가져오기 또는 검증 버튼을 직접 누를 때만 읽습니다.
          </p>
        </div>
        <div className="settings-repo-summary">
          <Badge tone="purple">{summary.total}개</Badge>
          {summary.verified > 0 ? <Badge tone="green">검증됨 {summary.verified}</Badge> : null}
          {summary.stale > 0 ? <Badge tone="orange">오래됨 {summary.stale}</Badge> : null}
          {summary.failed > 0 ? <Badge tone="red">실패 {summary.failed}</Badge> : null}
          {summary.unverified > 0 ? <Badge tone="gray">미검증 {summary.unverified}</Badge> : null}
        </div>
      </header>

      <div className="settings-repo-add">
        <label>
          경로
          <input
            placeholder={desktopRuntime ? "C:\\dev\\mori 또는 폴더 선택" : "C:\\dev\\mori"}
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
          />
        </label>
        <label>
          라벨 <small>(선택, 기본은 폴더명)</small>
          <input
            placeholder="Mori"
            value={labelInput}
            onChange={(event) => setLabelInput(event.target.value)}
          />
        </label>
        <div>
          <Button
            icon={FolderOpen}
            onClick={handlePick}
            disabled={!desktopRuntime || picking}
            title={
              desktopRuntime
                ? "네이티브 폴더 선택 창 열기"
                : "네이티브 선택 창은 Tauri 앱에서만 사용할 수 있습니다."
            }
          >
            {picking ? "선택 중..." : "폴더 선택"}
          </Button>
          <Button variant="primary" icon={FolderPlus} onClick={handleAdd}>
            추가
          </Button>
        </div>
        {error ? <p className="settings-repo-error" role="alert">{error}</p> : null}
      </div>

      {repositories.length === 0 ? (
        <p className="settings-empty">저장된 리포지토리가 없습니다. 위 입력란에서 직접 추가하세요.</p>
      ) : (
        <ul className="settings-repo-list">
          {repositories.map((repo) => {
            const isSelected = repo.id === defaultRepositoryId;
            const isVerifying = verifyingId === repo.id;
            return (
              <li key={repo.id} className={isSelected ? "is-default" : ""}>
                <div className="settings-repo-info">
                  <strong>{repo.label}</strong>
                  <small title={repo.path}>{repo.path}</small>
                  <RepoVerificationBadge verification={repo.verification} isVerifying={isVerifying} />
                  {repo.lastUsedAt ? (
                    <small className="settings-repo-muted">마지막 사용: {new Date(repo.lastUsedAt).toLocaleString()}</small>
                  ) : null}
                </div>
                <RepoLabelEditor currentLabel={repo.label} onSave={(label) => onRename(repo.id, label)} />
                <div className="settings-repo-actions">
                  <Button
                    icon={CheckCircle2}
                    onClick={() => onVerify(repo.id)}
                    disabled={!desktopRuntime || isVerifying}
                    title={
                      desktopRuntime
                        ? "이 경로에 git rev-parse / branch / status를 실행합니다."
                        : "검증은 Tauri 데스크톱 앱에서만 가능합니다."
                    }
                  >
                    {isVerifying
                      ? "검증 중..."
                      : repo.verification && repo.verification.status === "verified"
                        ? getRepositoryVerificationFreshness(repo.verification).isStale
                          ? "다시 검증"
                          : "검증"
                        : "검증"}
                  </Button>
                  {repo.verification && repo.verification.status !== "unverified" ? (
                    <Button
                      icon={RotateCcw}
                      onClick={() => onClearVerification(repo.id)}
                      title="검증 메타데이터 지우기"
                      aria-label="검증 기록 지우기"
                    />
                  ) : null}
                  <Button
                    icon={Star}
                    onClick={() => onSelect(repo.id)}
                    disabled={isSelected}
                    title="Git diff 캡처의 기본값으로 설정"
                  >
                    {isSelected ? "기본" : "기본으로"}
                  </Button>
                  <Button icon={Trash2} onClick={() => onRemove(repo.id)} aria-label="리포지토리 제거" />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SectionHeader title="Mori가 리포지토리에 대해 보장하는 것" />
      <ul className="settings-repo-pledges">
        <li>앱 시작 / 화면 전환 / hydrate / SQLite 초기화 시점에 검증을 실행하지 않습니다.</li>
        <li>저장된 경로 외에는 어떤 디렉터리도 읽지 않습니다.</li>
        <li>Git diff 캡처와 검증 외에는 디스크에 접근하지 않습니다.</li>
      </ul>
    </section>
  );
}

function RepoVerificationBadge({
  verification,
  isVerifying,
}: {
  verification: RepositoryVerificationMetadata | undefined;
  isVerifying: boolean;
}) {
  if (isVerifying) return <Badge tone="purple">검증 중</Badge>;
  if (!verification || verification.status === "unverified") {
    return <Badge tone="gray">미검증</Badge>;
  }
  if (verification.status === "failed") {
    return (
      <span className="settings-repo-verify">
        <Badge tone="red">검증 실패</Badge>
        {verification.error ? <small>{verification.error}</small> : null}
      </span>
    );
  }
  const freshness = getRepositoryVerificationFreshness(verification);
  const branch = verification.currentBranch ?? "detached";
  const sha = verification.shortHeadCommit ?? verification.headCommit?.slice(0, 7) ?? "—";
  return (
    <span className="settings-repo-verify">
      <Badge tone={freshness.isStale ? "orange" : "green"}>
        {freshness.isStale ? "오래됨 · " : "검증됨 · "}
        {branch} · {sha}
      </Badge>
      {verification.isDirty ? <Badge tone="orange">변경 있음</Badge> : null}
      {freshness.ageLabel ? <small className="settings-repo-muted">{freshness.ageLabel}</small> : null}
    </span>
  );
}

function RepoLabelEditor({ currentLabel, onSave }: { currentLabel: string; onSave: (label: string) => void }) {
  const [draft, setDraft] = useState(currentLabel);
  useEffect(() => {
    setDraft(currentLabel);
  }, [currentLabel]);
  return (
    <input
      className="settings-repo-label-input"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== currentLabel) onSave(next);
        else setDraft(currentLabel);
      }}
      aria-label="리포지토리 라벨"
    />
  );
}

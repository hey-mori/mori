import { Boxes, FileStack, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  GitDiffParseError,
  normalizeAiTranscript,
  normalizeGitDiff,
  normalizeManualNote,
  normalizeUrlSource,
  type AiTranscriptPlatform,
} from "../../lib/import";
import {
  buildWorkBundlePreview,
  type WorkBundleItem,
  type WorkBundleSourceOrigin,
  type WorkBundlePreview,
} from "../../lib/import/workBundle";
import { buildWorkBundleFixtureItems } from "../../lib/import/fixtures/workBundleFixture";
import { normalizeConnectorEventBatch, parseConnectorJsonl } from "../../lib/connectors";
import { selectSessionView, useMoriSessionStore } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { getTrustDisplay } from "../../lib/evidence/trust";
import { formatDateTime } from "../../lib/formatting/time";

type AddKind = "ai" | "git" | "note" | "url" | "connector";

type PanelStatus = { tone: "ok" | "error" | "info"; message: string } | null;

const FIDELITY_LABELS: Record<string, string> = {
  full: "온전",
  partial: "부분",
  fragment: "조각",
  unknown: "알 수 없음",
};

const RETENTION_LABELS: Record<string, string> = {
  retained: "원본 보관",
  summaryOnly: "요약만",
  deleted: "미보관",
};

let bundleItemSeq = 0;
function nextItemId(): string {
  bundleItemSeq += 1;
  return `wb-${Date.now().toString(36)}-${bundleItemSeq}`;
}

/**
 * Work Bundle import — assemble several sources from one work session into a
 * single composite preview, then apply them together. The preview is the
 * explicit review-before-apply gate; applying persists each source as its own
 * import so per-source provenance survives into the Evidence Hub and Timeline.
 */
export function WorkBundlePanel() {
  const draft = useMoriSessionStore((state) => state.draft);
  const view = useMoriSessionStore(selectSessionView);
  const addImportBatch = useMoriSessionStore((state) => state.addImportBatch);
  const navigate = useMoriAppStore((state) => state.navigate);

  const projectId = draft?.project.id ?? view.project.id;
  const sessionId = draft?.session.id ?? view.session.id;
  const hasSession = Boolean(draft);

  const [items, setItems] = useState<WorkBundleItem[]>([]);
  const [status, setStatus] = useState<PanelStatus>(null);

  const [kind, setKind] = useState<AddKind>("ai");
  const [platform, setPlatform] = useState<AiTranscriptPlatform>("claude");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");

  const preview = useMemo<WorkBundlePreview>(() => buildWorkBundlePreview(items), [items]);

  function resetForm() {
    setTitle("");
    setUrl("");
    setBody("");
  }

  function appendItems(origin: WorkBundleSourceOrigin, candidates: WorkBundleItem["candidate"][]) {
    setItems((prev) => [
      ...prev,
      ...candidates.map((candidate) => ({ id: nextItemId(), origin, candidate })),
    ]);
  }

  function handleLoadSample() {
    const sample = buildWorkBundleFixtureItems({ projectId, sessionId });
    setItems(sample.map((item) => ({ ...item, id: nextItemId() })));
    setStatus({
      tone: "info",
      message: `샘플 AI 코딩 작업 번들을 불러왔습니다 (${sample.length}개 소스). 미리보기를 확인한 뒤 적용하세요.`,
    });
  }

  function handleAddSource() {
    const base = { projectId, sessionId };
    try {
      if (kind === "note") {
        if (!body.trim()) return setStatus({ tone: "error", message: "메모 본문을 입력하세요." });
        appendItems("manual-note", [normalizeManualNote({ ...base, title: title.trim() || undefined, note: body })]);
      } else if (kind === "url") {
        if (!url.trim()) return setStatus({ tone: "error", message: "URL을 입력하세요." });
        try {
          new URL(url.trim());
        } catch {
          return setStatus({ tone: "error", message: "올바른 URL 형식이 아닙니다." });
        }
        appendItems("url", [
          normalizeUrlSource({ ...base, title: title.trim() || url.trim(), url: url.trim(), selectedText: body.trim() || undefined }),
        ]);
      } else if (kind === "git") {
        if (!body.trim()) return setStatus({ tone: "error", message: "Git diff 텍스트를 붙여넣으세요." });
        appendItems("git-diff", [normalizeGitDiff({ ...base, title: title.trim() || undefined, diffText: body })]);
      } else if (kind === "connector") {
        if (!body.trim()) return setStatus({ tone: "error", message: "Connector JSONL을 붙여넣으세요." });
        const outcome = parseConnectorJsonl(body);
        const candidates = normalizeConnectorEventBatch({ ...base, events: outcome.events });
        if (candidates.length === 0) {
          return setStatus({
            tone: "error",
            message: `유효한 connector 이벤트가 없습니다${outcome.errors.length ? ` (오류 ${outcome.errors.length}줄)` : ""}.`,
          });
        }
        appendItems("connector-jsonl", candidates);
      } else {
        if (!body.trim()) return setStatus({ tone: "error", message: "AI 대화 본문을 붙여넣으세요." });
        appendItems("ai-transcript", [normalizeAiTranscript({ ...base, title: title.trim() || undefined, platform, text: body })]);
      }
    } catch (error) {
      if (error instanceof GitDiffParseError) return setStatus({ tone: "error", message: error.message });
      return setStatus({ tone: "error", message: error instanceof Error ? error.message : "소스를 추가하지 못했습니다." });
    }
    setStatus({ tone: "ok", message: "소스를 번들에 추가했습니다." });
    resetForm();
  }

  function handleRemove(itemId: string) {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  function handleClear() {
    setItems([]);
    setStatus(null);
  }

  function handleApply() {
    if (!hasSession) {
      return setStatus({ tone: "error", message: "적용하려면 먼저 세션을 시작하거나 소스에서 대화를 가져오세요." });
    }
    if (items.length === 0) {
      return setStatus({ tone: "error", message: "번들에 소스가 없습니다." });
    }
    const stored = addImportBatch(items.map((item) => item.candidate));
    if (stored.length === 0) {
      return setStatus({ tone: "error", message: "세션을 찾을 수 없어 적용하지 못했습니다." });
    }
    setStatus({
      tone: "ok",
      message: `${stored.length}개 소스 · ${preview.totalEventCount}개 이벤트를 타임라인에 적용했습니다.`,
    });
    setItems([]);
    navigate("timeline");
  }

  return (
    <section className="work-bundle-panel" aria-label="작업 번들 가져오기">
      <header className="work-bundle-head">
        <div className="work-bundle-head-text">
          <h2>
            <Boxes size={18} /> 작업 번들 가져오기
          </h2>
          <p>
            자동 감지된 대화가 없을 때 쓰는 수동 경로입니다. 한 작업이 남긴 여러 소스(대화 ·
            Codex/OpenCode 실행 · git diff · 터미널 로그 · 메모)를 직접 붙여 하나의 작업 세션으로
            미리 보고 함께 가져옵니다.
          </p>
        </div>
        <Badge tone={hasSession ? "green" : "gray"}>{hasSession ? "실제 세션" : "세션 필요"}</Badge>
      </header>

      <div className="work-bundle-add">
        <div className="work-bundle-add-controls">
          <label>
            소스 종류
            <select value={kind} onChange={(event) => setKind(event.target.value as AddKind)}>
              <option value="ai">AI 대화</option>
              <option value="connector">Connector JSONL (Codex/OpenCode/터미널)</option>
              <option value="git">Git diff</option>
              <option value="note">메모</option>
              <option value="url">URL</option>
            </select>
          </label>
          {kind === "ai" ? (
            <label>
              플랫폼
              <select value={platform} onChange={(event) => setPlatform(event.target.value as AiTranscriptPlatform)}>
                <option value="claude">Claude</option>
                <option value="chatgpt">ChatGPT</option>
                <option value="codex">Codex</option>
                <option value="other">기타</option>
              </select>
            </label>
          ) : null}
          <label className="work-bundle-add-title">
            제목 <small>(선택)</small>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="오프라인 동기화 설계" />
          </label>
        </div>
        {kind === "url" ? (
          <label>
            URL
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/spec" />
          </label>
        ) : null}
        <label className="work-bundle-add-body">
          {kind === "url" ? "발췌 / 메모 (선택)" : kind === "connector" ? "Connector JSONL (한 줄에 한 이벤트)" : kind === "git" ? "Unified git diff" : kind === "note" ? "메모 본문" : "대화 전문"}
          <textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} placeholder="여기에 붙여넣으세요" />
        </label>
        <div className="work-bundle-add-actions">
          <Button icon={Plus} onClick={handleAddSource}>
            번들에 추가
          </Button>
          <Button variant="ghost" icon={Sparkles} onClick={handleLoadSample}>
            샘플 번들 불러오기
          </Button>
          {items.length > 0 ? (
            <Button variant="ghost" icon={Trash2} onClick={handleClear}>
              비우기
            </Button>
          ) : null}
          {status ? <span className={`import-status tone-${status.tone}`}>{status.message}</span> : null}
        </div>
        <p className="work-bundle-privacy" role="note">
          붙여넣거나 명시적으로 추가한 소스만 처리합니다. 폴더 감시·계정 스캔·자동 메모 작성은 없습니다.
          적용하면 각 소스가 별도 자료로 저장되어 어떤 소스가 어떤 이벤트를 만들었는지 추적할 수 있습니다.
        </p>
      </div>

      {preview.isEmpty ? null : <WorkBundlePreviewCard preview={preview} onRemove={handleRemove} />}

      {preview.isEmpty ? null : (
        <div className="work-bundle-apply">
          <Button variant="primary" icon={FileStack} onClick={handleApply} disabled={!hasSession}>
            타임라인에 적용 · {preview.willCreate.sourceCount}개 소스 / {preview.willCreate.eventCount}개 이벤트
          </Button>
          {!hasSession ? (
            <small className="work-bundle-apply-hint">
              적용하려면 세션이 필요합니다. 위 미리보기는 세션 없이도 동작합니다.
            </small>
          ) : null}
        </div>
      )}
    </section>
  );
}

function WorkBundlePreviewCard({
  preview,
  onRemove,
}: {
  preview: WorkBundlePreview;
  onRemove: (itemId: string) => void;
}) {
  const span =
    preview.spanStart && preview.spanEnd
      ? `${formatDateTime(preview.spanStart)} → ${formatDateTime(preview.spanEnd)}`
      : "—";
  return (
    <section className="work-bundle-preview" aria-label="작업 번들 미리보기">
      <header className="work-bundle-preview-head">
        <div>
          <span className="work-bundle-preview-eyebrow">제안된 작업 단위</span>
          <strong className="work-bundle-preview-title">{preview.proposedTitle}</strong>
        </div>
        <div className="work-bundle-family-chips">
          {preview.familyLabels.map((label) => (
            <Badge key={label} tone="purple">
              {label}
            </Badge>
          ))}
        </div>
      </header>

      <ul className="work-bundle-stats">
        <li>
          <span>소스</span>
          <strong>{preview.willCreate.sourceCount}</strong>
        </li>
        <li>
          <span>이벤트</span>
          <strong>{preview.totalEventCount}</strong>
        </li>
        <li>
          <span>파일</span>
          <strong>{preview.willCreate.fileCount}</strong>
        </li>
        <li>
          <span>중복</span>
          <strong>{preview.duplicateEventCount}</strong>
        </li>
      </ul>

      <dl className="work-bundle-meta">
        <div>
          <dt>작업 영역</dt>
          <dd>{preview.workContextHint ?? "—"}</dd>
        </div>
        <div>
          <dt>기간</dt>
          <dd>{span}</dd>
        </div>
        <div>
          <dt>신뢰도</dt>
          <dd>
            검증 {preview.trustSummary.verified} · 관찰 {preview.trustSummary.observed} · 추론 {preview.trustSummary.inferred}
          </dd>
        </div>
        <div>
          <dt>캡처 충실도</dt>
          <dd>
            온전 {preview.fidelitySummary.full} · 부분 {preview.fidelitySummary.partial} · 조각 {preview.fidelitySummary.fragment} · 미상 {preview.fidelitySummary.unknown}
          </dd>
        </div>
      </dl>

      {preview.secretFlagged || preview.redactionPending ? (
        <div className="work-bundle-warnings" role="status">
          {preview.secretFlagged ? <Badge tone="red">민감정보 의심 — 적용 전 검토</Badge> : null}
          {preview.redactionPending ? <Badge tone="orange">레닥션 대기 중인 소스 있음</Badge> : null}
        </div>
      ) : null}

      {preview.detectedFiles.length > 0 ? (
        <div className="work-bundle-files">
          <span className="work-bundle-files-label">감지된 파일</span>
          <div className="work-bundle-files-chips">
            {preview.detectedFiles.slice(0, 12).map((file) => (
              <code key={file}>{file}</code>
            ))}
            {preview.detectedFiles.length > 12 ? (
              <small>외 {preview.detectedFiles.length - 12}개</small>
            ) : null}
          </div>
        </div>
      ) : null}

      <ul className="work-bundle-source-list">
        {preview.sources.map((source) => (
          <li key={source.itemId} className="work-bundle-source-row">
            <div className="work-bundle-source-main">
              <Badge tone="gray">{source.familyShortLabel}</Badge>
              <strong>{source.title}</strong>
              <button
                type="button"
                className="work-bundle-source-remove"
                onClick={() => onRemove(source.itemId)}
                aria-label={`${source.title} 제거`}
                title="번들에서 제거"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="work-bundle-source-meta">
              <span>
                이벤트 {source.newEventCount}
                {source.duplicateEventCount > 0 ? ` (+중복 ${source.duplicateEventCount})` : ""}
              </span>
              <span>{getTrustDisplay(source.trustLevel).label}</span>
              <span>{FIDELITY_LABELS[source.fidelityLevel] ?? source.fidelityLevel}</span>
              <span>{RETENTION_LABELS[source.rawRetention] ?? source.rawRetention}</span>
            </div>
            {source.fileRefs.length > 0 ? (
              <div className="work-bundle-source-files">
                {source.fileRefs.slice(0, 4).map((file) => (
                  <code key={file}>{file}</code>
                ))}
                {source.fileRefs.length > 4 ? <small>외 {source.fileRefs.length - 4}개</small> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

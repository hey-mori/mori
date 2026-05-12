import { Bot, FileText, Globe, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  normalizeAiConversationText,
  normalizeManualNote,
  normalizeUrlSource,
  type NormalizedImportCandidate,
} from "../../lib/import";
import { useMoriSessionStore } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";

type ImportKind = "note" | "url" | "ai";

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
  const [status, setStatus] = useState<ImportStatus>(null);

  const canImport = useMemo(() => Boolean(draft), [draft]);

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
        <label className="import-body">
          {kind === "url" ? "발췌 / 메모 (선택)" : kind === "ai" ? "대화 전문" : "메모 본문"}
          <textarea
            placeholder={
              kind === "ai"
                ? "User: ...\n\nAssistant: ..."
                : kind === "url"
                  ? "관련 문장을 옮겨두면 검색과 분석에 도움이 됩니다."
                  : "Mori는 work-flow reconstruction, not searchable memory."
            }
            rows={kind === "ai" ? 6 : 4}
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
                <Badge tone={entry.source.kind === "browser" ? "cyan" : entry.source.kind === "aiConversation" ? "purple" : "gray"}>
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

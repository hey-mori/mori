import { Check, ClipboardCopy, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

export type ResumePromptOrigin =
  | { kind: "analysis"; providerLabel: string }
  | { kind: "demo" }
  | { kind: "fallback" };

export function ResumePromptCard({
  prompt,
  origin,
  emptyHint,
}: {
  prompt: string;
  origin: ResumePromptOrigin;
  /** Optional copy that replaces the prompt block when prompt is empty. */
  emptyHint?: string;
}) {
  const [copied, setCopied] = useState(false);
  const hasPrompt = prompt.trim().length > 0;

  async function handleCopy() {
    if (!hasPrompt) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(prompt);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const originBadge = (() => {
    if (origin.kind === "analysis") {
      return <Badge tone="purple">{origin.providerLabel}</Badge>;
    }
    if (origin.kind === "demo") {
      return <Badge tone="gray">데모 데이터</Badge>;
    }
    return <Badge tone="orange">폴백 (Quick Pass 미실행)</Badge>;
  })();

  return (
    <section className="resume-prompt-card" aria-label="다음 세션으로 이어가기">
      <header className="resume-prompt-head">
        <div>
          <h2>다음 세션으로 이어가기</h2>
          <p>이 세션의 AI 작업을 정리한 컨텍스트입니다. Claude / ChatGPT / Codex 다음 대화에 붙여넣으면 이어서 작업할 수 있습니다.</p>
        </div>
        <div className="resume-prompt-meta">
          {originBadge}
          <Button
            icon={copied ? Check : ClipboardCopy}
            onClick={handleCopy}
            disabled={!hasPrompt}
            variant={hasPrompt ? "primary" : "secondary"}
            title={hasPrompt ? "컨텍스트를 클립보드로 복사" : "컨텍스트가 비어 있습니다"}
          >
            {copied ? "복사됨" : "컨텍스트 복사"}
          </Button>
        </div>
      </header>

      {hasPrompt ? (
        <pre className="resume-prompt-body">{prompt}</pre>
      ) : (
        <div className="resume-prompt-empty">
          <Sparkles size={18} aria-hidden="true" />
          <p>{emptyHint ?? "Quick Pass를 실행하면 분석 결과 기반 프롬프트가 표시됩니다."}</p>
        </div>
      )}
    </section>
  );
}

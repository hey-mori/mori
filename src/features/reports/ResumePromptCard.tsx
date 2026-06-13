import { ArrowRight, Check, ClipboardCopy } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";

export function ResumePromptCard({
  prompt,
  title = "이어가기",
  emptyHint,
}: {
  prompt: string;
  /** Section heading. Defaults to the product vocabulary for resuming work. */
  title?: string;
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

  return (
    <section className="resume-prompt-card is-compact" aria-label={title}>
      <header className="resume-prompt-head">
        <div className="resume-prompt-title">
          <h2>{title}</h2>
          <InfoHint label="이어가기 설명">
            이 프롬프트를 새 AI 세션에 붙여넣으면 이 세션의 맥락과 다음 액션을 이어서 진행할 수 있습니다.
          </InfoHint>
        </div>
        <div className="resume-prompt-meta">
          <Button
            icon={copied ? Check : ClipboardCopy}
            onClick={handleCopy}
            disabled={!hasPrompt}
            variant={hasPrompt ? "primary" : "secondary"}
            size="sm"
          >
            {copied ? "복사됨" : "복사"}
          </Button>
        </div>
      </header>

      {hasPrompt ? (
        <details className="resume-prompt-details">
          <summary>
            <span>내용 보기</span>
          </summary>
          <pre className="resume-prompt-body base-scroll">{prompt}</pre>
        </details>
      ) : (
        <div className="resume-prompt-empty">
          <ArrowRight size={18} aria-hidden="true" />
          <p>{emptyHint ?? "분석을 실행하면 분석 결과 기반 프롬프트가 표시됩니다."}</p>
        </div>
      )}
    </section>
  );
}

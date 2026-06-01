import { Check, ClipboardCopy, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";

export function ResumePromptCard({
  prompt,
  emptyHint,
}: {
  prompt: string;
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
    <section className="resume-prompt-card is-compact" aria-label="프롬프트">
      <header className="resume-prompt-head">
        <div className="resume-prompt-title">
          <h2>프롬프트</h2>
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
          <pre className="resume-prompt-body">{prompt}</pre>
        </details>
      ) : (
        <div className="resume-prompt-empty">
          <Sparkles size={18} aria-hidden="true" />
          <p>{emptyHint ?? "Quick Pass를 실행하면 분석 결과 기반 프롬프트가 표시됩니다."}</p>
        </div>
      )}
    </section>
  );
}

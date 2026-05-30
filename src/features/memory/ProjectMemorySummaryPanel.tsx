import { AlertTriangle, Check, ClipboardCopy, Flag, Play, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { issueStatusLabels, priorityLabels } from "../../domain/constants";
import { formatTime } from "../../lib/formatting/time";
import {
  issueStatusTone,
  type ProjectMemorySummary,
} from "../../lib/project-memory/projectMemory";
import {
  PROJECT_MEMORY_RESUME_AUDIENCES,
  PROJECT_MEMORY_RESUME_PRIVACY_MODES,
  describeAudience,
  describePrivacyMode,
  type ProjectMemoryResumePromptAudience,
  type ProjectMemoryResumePromptPrivacy,
} from "../../lib/project-memory/projectMemoryResumePrompt";

const PRIORITY_TONE: Record<string, "red" | "orange" | "blue"> = {
  high: "red",
  medium: "orange",
  low: "blue",
};

export function ProjectMemorySummaryPanel({
  summary,
  followUpPrompt,
  audience,
  privacyMode,
  onAudienceChange,
  onPrivacyModeChange,
  onStartFollowUp,
}: {
  summary: ProjectMemorySummary;
  followUpPrompt: string;
  audience: ProjectMemoryResumePromptAudience;
  privacyMode: ProjectMemoryResumePromptPrivacy;
  onAudienceChange: (audience: ProjectMemoryResumePromptAudience) => void;
  onPrivacyModeChange: (privacy: ProjectMemoryResumePromptPrivacy) => void;
  onStartFollowUp: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(followUpPrompt);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside className="memory-summary" aria-label="프로젝트 메모리 요약">
      <header className="memory-summary-head">
        <Badge tone="purple">{summary.scopeLabel}</Badge>
        <h3>프로젝트 메모리 요약</h3>
        <p>{summary.scopeCaveat}</p>
      </header>

      <section className="memory-summary-section">
        <SectionHeader title="최신 중요 결정" />
        {summary.latestImportantDecision ? (
          <article className="memory-summary-decision">
            <header>
              <strong>{summary.latestImportantDecision.title}</strong>
              <Badge tone={PRIORITY_TONE[summary.latestImportantDecision.importance] ?? "blue"}>
                <Flag size={10} aria-hidden="true" /> {priorityLabels[summary.latestImportantDecision.importance]}
              </Badge>
            </header>
            <p>{summary.latestImportantDecision.decision}</p>
            <small>
              <ShieldCheck size={10} aria-hidden="true" />
              {summary.latestImportantDecision.confirmed ? " Confirmed" : " Pending"} ·
              {" "}
              {formatTime(summary.latestImportantDecision.createdAt)}
            </small>
          </article>
        ) : (
          <p className="memory-summary-empty">기록된 중요 결정이 없습니다.</p>
        )}
      </section>

      <section className="memory-summary-section">
        <SectionHeader title="해결되지 않은 위험" hint={`${summary.unresolvedRisks.length}건`} />
        {summary.unresolvedRisks.length === 0 ? (
          <p className="memory-summary-empty">
            <ShieldCheck size={12} aria-hidden="true" /> 추가 검토가 필요한 위험이 없습니다.
          </p>
        ) : (
          <ul className="memory-summary-risks">
            {summary.unresolvedRisks.map((risk) => (
              <li key={risk.id}>
                <AlertTriangle size={12} aria-hidden="true" />
                <span>
                  <strong title={risk.title}>{risk.title}</strong>
                  <small>
                    <Badge tone={issueStatusTone(risk.status)}>{issueStatusLabels[risk.status]}</Badge>
                    <Badge tone={PRIORITY_TONE[risk.priority] ?? "blue"}>{priorityLabels[risk.priority]}</Badge>
                    {risk.trustLevel === "inferred" ? (
                      <Badge tone="orange">{Math.round(risk.confidence * 100)}%</Badge>
                    ) : null}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="memory-summary-section">
        <SectionHeader title="다음 추천 세션" />
        <p className="memory-summary-next">
          <Sparkles size={12} aria-hidden="true" />
          <span>{summary.nextRecommendedSessionTopic}</span>
        </p>
      </section>

      <section className="memory-summary-section">
        <SectionHeader title="Resume 프롬프트" hint="프로젝트 메모리 기반 · 새 세션에 붙여넣기" />
        <div className="memory-summary-prompt-controls">
          <label>
            <span>대상</span>
            <select
              value={audience}
              onChange={(event) =>
                onAudienceChange(event.target.value as ProjectMemoryResumePromptAudience)
              }
            >
              {PROJECT_MEMORY_RESUME_AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {describeAudience(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>공개 범위</span>
            <select
              value={privacyMode}
              onChange={(event) =>
                onPrivacyModeChange(event.target.value as ProjectMemoryResumePromptPrivacy)
              }
            >
              {PROJECT_MEMORY_RESUME_PRIVACY_MODES.map((value) => (
                <option key={value} value={value}>
                  {describePrivacyMode(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <pre className="memory-summary-prompt">{followUpPrompt}</pre>
        <div className="memory-summary-actions">
          <Button icon={copied ? Check : ClipboardCopy} onClick={handleCopy} variant="primary">
            {copied ? "복사됨" : "프롬프트 복사"}
          </Button>
          <Button icon={Play} onClick={onStartFollowUp}>
            새 세션
          </Button>
        </div>
        <small className="memory-summary-prompt-note">
          이 프롬프트는 로컬에 저장된 Mori 세션에서만 생성됩니다. 클라우드 동기화, 외부 계정 / 파일 접근,
          백그라운드 캡처는 포함되지 않습니다. 대상 / 공개 범위 설정은 표시되는 프롬프트에만 영향을 줍니다.
        </small>
      </section>
    </aside>
  );
}

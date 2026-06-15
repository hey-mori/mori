import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { SectionHeader } from "../../components/ui/SectionHeader";
import {
  getPrivacyGuarantees,
  getRecommendedSetupStep,
  type RecommendedSetupStep,
  type RuntimeMode,
} from "../../lib/settings/settingsStatus";
import type { QuickPassProviderKind } from "../../lib/analysis";

export type TrustSummaryProps = {
  mode: RuntimeMode;
  sqliteKind: "ok" | "checking" | "error" | "unavailable";
  providerKind: QuickPassProviderKind;
  importsCount: number;
  hasAnalysis: boolean;
  hasUnsavedDraft: boolean;
  repositoriesTotal: number;
  onAction: (step: RecommendedSetupStep) => void;
};

const ACCESS_ACTIVE = [
  "사용자가 직접 입력하거나 붙여넣은 메모 / URL / AI transcript / Git diff",
  "사용자가 추가한 리포지토리 경로 (Git diff / Verify 실행 시에만)",
  "사용자가 직접 설정한 Ollama endpoint",
  "현재 세션의 분석 결과",
];

// The "never does" list is the shared privacy-guarantee source — see
// `getPrivacyGuarantees` and the Privacy & Data Control surface.
const ACCESS_NEVER = getPrivacyGuarantees();

export function TrustSummaryPanel({
  mode,
  sqliteKind,
  providerKind,
  importsCount,
  hasAnalysis,
  hasUnsavedDraft,
  repositoriesTotal,
  onAction,
}: TrustSummaryProps) {
  const step = getRecommendedSetupStep({
    importsCount,
    hasAnalysis,
    repositoriesTotal,
    mode,
    sqliteKind,
    hasUnsavedDraft,
    providerKind,
  });

  return (
    <section className="settings-trust" aria-label="신뢰 요약">
      <header className="settings-trust-head">
        <Badge tone="purple">로컬 우선</Badge>
        <h3>Mori 신뢰 요약</h3>
        <p>가져온 데이터만 사용합니다. 지금 쓰는 데이터와 절대 하지 않는 동작입니다.</p>
      </header>

      <div className="settings-trust-lists">
      <section className="settings-trust-section">
        <SectionHeader title="사용하는 데이터" />
        <ul className="settings-trust-list tone-active">
          {ACCESS_ACTIVE.map((line) => (
            <li key={line}>
              <ShieldCheck size={12} aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="settings-trust-section">
        <SectionHeader title="절대 하지 않는 것" />
        <ul className="settings-trust-list tone-never">
          {ACCESS_NEVER.map((line) => (
            <li key={line}>
              <Lock size={12} aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>
      </div>

      <section className="settings-trust-section">
        <SectionHeader title="추천 다음 단계" />
        <button
          type="button"
          className="settings-trust-next"
          onClick={() => onAction(step)}
          disabled={step.id === "all-good"}
        >
          <span>
            <strong>{labelForStep(step.id)}</strong>
            <small>{step.label}</small>
          </span>
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </section>
    </section>
  );
}

function labelForStep(id: RecommendedSetupStep["id"]): string {
  switch (id) {
    case "import-source":
      return "1. 소스 가져오기";
    case "run-quickpass":
      return "2. 분석 실행";
    case "save-to-sqlite":
      return "3. SQLite에 저장";
    case "verify-repository":
      return "4. 리포지토리 추가";
    case "configure-ollama":
      return "5. 로컬 LLM 설정";
    case "all-good":
      return "설정 완료";
  }
}

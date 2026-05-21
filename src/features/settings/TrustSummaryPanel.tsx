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
  providerLabel: string;
  importsCount: number;
  hasAnalysis: boolean;
  hasUnsavedDraft: boolean;
  repositoriesTotal: number;
  sessionMode: "demo" | "draft";
  onAction: (step: RecommendedSetupStep) => void;
};

const ACCESS_ACTIVE = [
  "사용자가 직접 입력하거나 붙여넣은 메모 / URL / AI transcript / Git diff",
  "사용자가 추가한 리포지토리 경로 (Git diff / Verify 실행 시에만)",
  "사용자가 직접 설정한 Ollama endpoint",
  "현재 세션의 Quick Pass 결과",
];

// The "never does" list is the shared privacy-guarantee source — see
// `getPrivacyGuarantees` and the Privacy & Data Control surface.
const ACCESS_NEVER = getPrivacyGuarantees();

export function TrustSummaryPanel({
  mode,
  sqliteKind,
  providerKind,
  providerLabel,
  importsCount,
  hasAnalysis,
  hasUnsavedDraft,
  repositoriesTotal,
  sessionMode,
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

  const storageLabel =
    mode === "browser"
      ? "Browser 임시 저장 (localStorage)"
      : sqliteKind === "ok"
        ? "Desktop SQLite"
        : "Tauri desktop · SQLite 미초기화";

  return (
    <aside className="settings-trust" aria-label="Trust summary">
      <header className="settings-trust-head">
        <Badge tone="purple">Local-first</Badge>
        <h3>Mori 신뢰 요약</h3>
        <p>
          Mori는 사용자가 명시적으로 가져온 데이터만 사용합니다. 이 패널은 지금 활성화된 동작과 절대 일어나지 않는
          동작을 한눈에 보여줍니다.
        </p>
      </header>

      <section className="settings-trust-section">
        <SectionHeader title="현재 동작 모드" />
        <dl className="settings-trust-grid">
          <div>
            <dt>Runtime</dt>
            <dd>{mode === "browser" ? "Browser prototype" : "Tauri desktop"}</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>{storageLabel}</dd>
          </div>
          <div>
            <dt>Quick Pass</dt>
            <dd>{providerLabel}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{sessionMode === "demo" ? "Demo (mock 데이터)" : "실제 세션"}</dd>
          </div>
        </dl>
      </section>

      <section className="settings-trust-section">
        <SectionHeader title="Mori가 지금 접근하는 것" />
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
        <SectionHeader title="Mori가 절대 하지 않는 것" />
        <ul className="settings-trust-list tone-never">
          {ACCESS_NEVER.map((line) => (
            <li key={line}>
              <Lock size={12} aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

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
    </aside>
  );
}

function labelForStep(id: RecommendedSetupStep["id"]): string {
  switch (id) {
    case "import-source":
      return "1. 소스 가져오기";
    case "run-quickpass":
      return "2. Quick Pass 실행";
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

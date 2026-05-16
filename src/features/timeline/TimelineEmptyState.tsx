import { ListPlus, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";

export type TimelineEmptyVariant = "demo-empty" | "draft-no-imports" | "draft-needs-quick-pass";

export function TimelineEmptyState({
  variant,
  onOpenSources,
  onRunQuickPass,
  canRunQuickPass,
}: {
  variant: TimelineEmptyVariant;
  onOpenSources: () => void;
  onRunQuickPass: () => void;
  canRunQuickPass: boolean;
}) {
  if (variant === "demo-empty") {
    return (
      <EmptyState
        icon={Sparkles}
        title="데모 세션에는 이벤트가 없습니다"
        description="Start Session에서 실제 세션을 시작하거나 Evidence에서 소스를 가져오세요."
      />
    );
  }
  if (variant === "draft-no-imports") {
    return (
      <EmptyState
        icon={ListPlus}
        title="이 세션에는 아직 가져온 자료가 없습니다"
        description="Mori는 사용자가 명시적으로 가져온 검증된 근거만 표시합니다 — 메모, URL, AI 대화, Git diff가 모두 여기에 모입니다."
        actions={
          <Button variant="primary" icon={ListPlus} onClick={onOpenSources}>
            Evidence 열기
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={Sparkles}
      title="소스를 가져왔습니다. Quick Pass를 실행하면 타임라인이 채워집니다."
      description="Quick Pass는 가져온 소스를 이벤트 · 이슈 · 결정 · Resume 프롬프트로 변환합니다. 로컬에서 실행되며 전적으로 명시적입니다."
      actions={
        <Button
          variant="primary"
          icon={Sparkles}
          onClick={onRunQuickPass}
          disabled={!canRunQuickPass}
          title={
            canRunQuickPass
              ? "활성 세션에 Quick Pass 실행"
              : "Quick Pass가 이미 실행 중입니다."
          }
        >
          Run Quick Pass
        </Button>
      }
    />
  );
}

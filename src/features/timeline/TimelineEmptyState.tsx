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
        title="Demo session has no events"
        description="Switch to a real session from Start Session or import a source from Evidence."
      />
    );
  }
  if (variant === "draft-no-imports") {
    return (
      <EmptyState
        icon={ListPlus}
        title="This session has no imports yet"
        description="Mori only shows verified evidence you explicitly import — manual notes, URLs, AI conversations, and Git diffs all land here."
        actions={
          <Button variant="primary" icon={ListPlus} onClick={onOpenSources}>
            Open Evidence
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={Sparkles}
      title="Imports captured. Run Quick Pass to populate the timeline."
      description="Quick Pass turns imported sources into events, issues, decisions, and a resume prompt. It runs locally and is fully explicit."
      actions={
        <Button
          variant="primary"
          icon={Sparkles}
          onClick={onRunQuickPass}
          disabled={!canRunQuickPass}
          title={canRunQuickPass ? "Run Quick Pass against the active session" : "Quick Pass is already running"}
        >
          Run Quick Pass
        </Button>
      }
    />
  );
}

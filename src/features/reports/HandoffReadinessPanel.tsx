import { Check, ClipboardCopy, FileText, PackageCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type {
  HandoffReadinessActionId,
  HandoffReadinessItem,
  HandoffReadinessStatus,
  HandoffReadinessViewModel,
} from "../../lib/report/handoffReadiness";

export function HandoffReadinessPanel({
  model,
  resumePrompt,
  onAction,
}: {
  model: HandoffReadinessViewModel;
  resumePrompt: string;
  onAction: (actionId: HandoffReadinessActionId) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function handleAction(actionId: HandoffReadinessActionId) {
    if (actionId !== "copyResume") {
      onAction(actionId);
      return;
    }
    try {
      if (!resumePrompt.trim()) throw new Error("Resume Prompt is empty.");
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("Clipboard is unavailable in this runtime.");
      }
      await navigator.clipboard.writeText(resumePrompt);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2400);
    }
  }

  return (
    <section className="handoff-readiness" aria-label="Continue-later handoff readiness">
      <header className="handoff-readiness-head">
        <div>
          <span className="handoff-readiness-kicker">작업 마무리</span>
          <h2>{model.headline}</h2>
          <p>{model.detail}</p>
        </div>
        <Badge tone={overallTone(model.items)}>
          {model.items.filter((item) => item.status === "ready").length}/{model.items.length} 완료
        </Badge>
      </header>

      <div className="handoff-readiness-grid">
        {model.items.map((item) => (
          <HandoffReadinessCard
            key={item.id}
            item={item}
            copyState={item.action.id === "copyResume" ? copyState : "idle"}
            onAction={handleAction}
          />
        ))}
      </div>
    </section>
  );
}

function HandoffReadinessCard({
  item,
  copyState,
  onAction,
}: {
  item: HandoffReadinessItem;
  copyState: "idle" | "copied" | "error";
  onAction: (actionId: HandoffReadinessActionId) => void;
}) {
  const Icon = itemIcon(item.id);
  const actionIcon = item.action.id === "copyResume" && copyState === "copied"
    ? Check
    : item.action.id === "copyResume"
      ? ClipboardCopy
      : item.id === "package"
        ? PackageCheck
        : FileText;
  return (
    <article className={`handoff-readiness-card status-${item.status}`}>
      <header>
        <span className="handoff-readiness-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <div>
          <h3>{item.title}</h3>
          <Badge tone={statusTone(item.status)}>{item.statusLabel}</Badge>
        </div>
      </header>
      <p>{item.detail}</p>
      <ul>
        {item.basis.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <footer>
        <Button
          icon={actionIcon}
          variant={item.status === "ready" ? "primary" : "secondary"}
          disabled={!item.action.enabled}
          onClick={() => void onAction(item.action.id)}
        >
          {copyState === "copied"
            ? "복사됨"
            : copyState === "error"
              ? "복사 실패"
              : item.action.label}
        </Button>
      </footer>
    </article>
  );
}

function itemIcon(id: HandoffReadinessItem["id"]) {
  if (id === "resume") return Sparkles;
  if (id === "package") return PackageCheck;
  return FileText;
}

function statusTone(status: HandoffReadinessStatus): "green" | "orange" | "gray" {
  if (status === "ready") return "green";
  if (status === "attention") return "orange";
  return "gray";
}

function overallTone(items: HandoffReadinessItem[]): "green" | "orange" | "gray" {
  if (items.every((item) => item.status === "ready")) return "green";
  if (items.some((item) => item.status === "attention")) return "orange";
  return "gray";
}

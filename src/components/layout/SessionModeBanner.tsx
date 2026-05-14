import { Sparkles } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import {
  selectSessionMode,
  selectSessionSource,
  useMoriSessionStore,
} from "../../app/sessionStore";

export function SessionModeBanner() {
  const mode = useMoriSessionStore(selectSessionMode);
  const source = useMoriSessionStore(selectSessionSource);
  const draft = useMoriSessionStore((state) => state.draft);
  const imports = useMoriSessionStore((state) => state.imports);
  const resetToDemo = useMoriSessionStore((state) => state.resetToDemo);

  if (mode === "demo") {
    return (
      <div className="session-mode-banner tone-demo">
        <span>
          <Badge tone="purple">Demo</Badge>
          <strong>Mori demo memory</strong>
          <span>Reference data only. Start a session to work with local sources.</span>
        </span>
      </div>
    );
  }

  const sourceBadge = source === "desktop-sqlite"
    ? { tone: "green", label: "Desktop SQLite", detail: "저장 위치 ~/Mori/Records/mori.sqlite" }
    : { tone: "blue", label: "Browser Draft", detail: "저장 위치 browser localStorage 초안" };

  return (
    <div className="session-mode-banner tone-draft">
      <span>
        <Badge tone="green">Live session</Badge>
        <Badge tone={sourceBadge.tone}>{sourceBadge.label}</Badge>
        <strong>{draft?.session.title}</strong>
        <span>{imports.length} imported sources · {sourceBadge.detail}</span>
      </span>
      <Button icon={Sparkles} onClick={resetToDemo}>Show demo</Button>
    </div>
  );
}

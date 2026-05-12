import { Sparkles } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { selectSessionMode, useMoriSessionStore } from "../../app/sessionStore";

export function SessionModeBanner() {
  const mode = useMoriSessionStore(selectSessionMode);
  const draft = useMoriSessionStore((state) => state.draft);
  const imports = useMoriSessionStore((state) => state.imports);
  const resetToDemo = useMoriSessionStore((state) => state.resetToDemo);

  if (mode === "demo") {
    return (
      <div className="session-mode-banner tone-demo">
        <span>
          <Badge tone="orange">데모 세션</Badge>
          <strong style={{ marginLeft: 8 }}>Mori 데모 데이터를 표시 중입니다.</strong>
          <span style={{ marginLeft: 6 }}>실제 데이터로 작업하려면 새 세션을 시작하고 소스를 가져오세요.</span>
        </span>
      </div>
    );
  }

  return (
    <div className="session-mode-banner tone-draft">
      <span>
        <Badge tone="green">실제 세션</Badge>
        <strong style={{ marginLeft: 8 }}>{draft?.session.title}</strong>
        <span style={{ marginLeft: 6 }}>
          가져온 소스 {imports.length}건 · 저장 위치 browser localStorage 초안
        </span>
      </span>
      <Button icon={Sparkles} onClick={resetToDemo}>데모로 되돌리기</Button>
    </div>
  );
}

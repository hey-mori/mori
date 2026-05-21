import { Sparkles } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import {
  selectSessionMode,
  selectSessionSource,
  useMoriSessionStore,
} from "../../app/sessionStore";

/**
 * Banner that sits between the TopSessionBar and the Timeline canvas.
 *
 * Honesty contract:
 *   - The banner never duplicates the title that the TopSessionBar already
 *     shows. It is purely about storage / mode origin.
 *   - In demo mode it offers a clear path back to the real flow.
 *   - In draft mode it surfaces the storage source (browser draft / desktop
 *     SQLite) and the import count so the user can see when Quick Pass will
 *     have something to chew on.
 *   - It is non-sticky on purpose. Scrolling the page should reveal more of
 *     the canvas without the banner clinging to the top.
 */
export function SessionModeBanner() {
  const mode = useMoriSessionStore(selectSessionMode);
  const source = useMoriSessionStore(selectSessionSource);
  const imports = useMoriSessionStore((state) => state.imports);
  const resetToDemo = useMoriSessionStore((state) => state.resetToDemo);

  if (mode === "demo") {
    return (
      <div className="session-mode-banner tone-demo" role="status">
        <span>
          <Badge tone="purple">데모</Badge>
          <strong>Mori 데모 메모리</strong>
          <span>참고용 데이터입니다 — 세션을 시작하면 로컬 소스를 캡처합니다.</span>
        </span>
      </div>
    );
  }

  const sourceBadge =
    source === "desktop-sqlite"
      ? { tone: "green" as const, label: "Desktop SQLite", detail: "~/Mori/Records/mori.sqlite" }
      : { tone: "blue" as const, label: "Browser Draft", detail: "browser localStorage" };

  return (
    <div className="session-mode-banner tone-draft" role="status">
      <span>
        <Badge tone="green">라이브 세션</Badge>
        <Badge tone={sourceBadge.tone}>{sourceBadge.label}</Badge>
        <span>
          가져온 소스 {imports.length}개 · {sourceBadge.detail}
        </span>
      </span>
      <Button icon={Sparkles} onClick={resetToDemo} title="데모 세션 메모리로 돌아가기">
        데모 보기
      </Button>
    </div>
  );
}

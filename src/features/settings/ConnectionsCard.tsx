import { useEffect, useMemo, useState } from "react";
import { Bot, ExternalLink } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../app/store";
import { isTauriRuntime } from "../../lib/desktop";
import { isClaudeBridgeAvailable } from "../../lib/claude/claudeTauri";
import { listAllAgentWorkSessions } from "../../lib/agents/workSessions";
import { SettingsSection, SettingsRow } from "./SettingsPrimitives";

/**
 * 연동 · connection settings.
 *
 * The former top-level 연동 surface is no longer a peer destination: input
 * channels are settings, and the agent world (live + session history) lives
 * under 라이브. This card is where you see connection status and open the
 * full agent / connection manager (retained, palette + here reachable).
 */
export function ConnectionsCard() {
  const navigate = useAppStore((state) => state.navigate);
  const closeSheet = useAppStore((state) => state.closeSettingsSheet);

  const desktop = useMemo(() => isTauriRuntime(), []);
  const bridge = useMemo(() => isClaudeBridgeAvailable(), []);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    let alive = true;
    void listAllAgentWorkSessions()
      .then((sessions) => {
        if (alive) setSessionCount(sessions.length);
      })
      .catch(() => {
        if (alive) setSessionCount(0);
      });
    return () => {
      alive = false;
    };
  }, []);

  const openManager = () => {
    closeSheet();
    navigate("connections");
  };

  return (
    <SettingsSection
      title="연동"
      action={
        <Button variant="secondary" size="sm" icon={ExternalLink} onClick={openManager}>
          연동 관리 열기
        </Button>
      }
    >
      <SettingsRow
        label="에이전트 로그 읽기"
        description="Claude · Codex · OpenCode · Antigravity가 남긴 세션 로그를 읽어 활동과 기록으로 정리합니다. 연결한 에이전트에 한하며, 반영 전에는 확인 단계를 거칩니다."
        meta={
          <span className="settings-connections-status">
            <Bot size={13} aria-hidden="true" />
            {desktop
              ? bridge
                ? "데스크톱 · 로컬 로그 연결됨"
                : "데스크톱 · 브리지 준비 중"
              : "브라우저 · 데스크톱 앱에서 로컬 로그 연결"}
            {sessionCount > 0 ? ` · 세션 ${sessionCount}개` : ""}
          </span>
        }
      />
      <SettingsRow
        label="입력 채널"
        description="직접 입력한 글, 붙여넣은 링크, 파일은 기록 화면의 빠른 입력과 확인 필요 목록에서 다룹니다. 별도의 연동 설정은 필요하지 않습니다."
      />
    </SettingsSection>
  );
}

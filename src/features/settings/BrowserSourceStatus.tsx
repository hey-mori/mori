import { useEffect, useState, useSyncExternalStore } from "react";
import { History } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { browserLiveSource } from "../../app/browserLiveSource";
import { Badge } from "../../components/ui/Badge";
import { InfoHint } from "../../components/ui/InfoHint";
import { BROWSER_CONTEXT_FRESH_MS, contextFreshness } from "../../lib/browser/browserLiveSource";
import { isTauriRuntime } from "../../lib/desktop";
import { SettingsSection } from "./SettingsPrimitives";

const KIND_LABEL = {
  context_snapshot: "브라우저 상태",
  tab_activated: "탭 전환",
  navigation_committed: "페이지 이동",
};

export function BrowserSourceStatus({ onHistory }: { onHistory: () => void }) {
  const state = useSyncExternalStore(browserLiveSource.subscribe, browserLiveSource.getState);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  if (!isTauriRuntime()) return null;
  const recent =
    state.lastReceivedAt !== null &&
    now - Date.parse(state.lastReceivedAt) < BROWSER_CONTEXT_FRESH_MS;
  return (
    <SettingsSection
      title="브라우저"
      action={
        <>
          <Badge tone={state.lastError ? "orange" : recent ? "green" : "gray"}>
            {state.lastError ? "수신 문제" : recent ? "최근 수신됨" : "연결 확인 안 됨"}
          </Badge>
          <InfoHint label="브라우저 수집 안내" align="start">
            수집 동의는 확장 프로그램에서 관리합니다. 최근 수신은 현재 연결이나 수집 켜짐을 보장하지
            않습니다. 브라우저 종료와 수집 꺼짐은 여기에서 확인할 수 없습니다.
          </InfoHint>
        </>
      }
    >
      <div className="browser-source-status browser-source-status-details" role="status">
        <span>수집 상태: 확장 프로그램에서 확인</span>
        {state.context ? (
          <span data-browser-context={contextFreshness(state, now)}>
            마지막 브라우저 상태: 창 {state.context.windows.length}개 · 탭{" "}
            {state.context.tabs.length}개
            {contextFreshness(state, now) === "stale" ? " · 갱신 대기" : ""}
          </span>
        ) : null}
        {state.lastReceivedAt && state.lastKind ? (
          <span>
            마지막 수신: {KIND_LABEL[state.lastKind]} ·{" "}
            <time dateTime={state.lastReceivedAt}>
              {new Date(state.lastReceivedAt).toLocaleTimeString("ko-KR")}
            </time>
          </span>
        ) : (
          <span>아직 받은 활동이 없습니다</span>
        )}
        {state.lastError ? (
          <span>
            {state.lastError === "persistence_failed"
              ? "활동을 저장하지 못했습니다"
              : "받은 활동을 처리하지 못했습니다"}
          </span>
        ) : null}
      </div>
      <Button className="browser-source-history-entry" icon={History} size="sm" onClick={onHistory}>
        브라우저 활동 보기
      </Button>
    </SettingsSection>
  );
}

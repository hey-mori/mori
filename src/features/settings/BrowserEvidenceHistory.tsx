import {
  ArrowDown,
  ArrowLeft,
  ChevronRight,
  Globe,
  MousePointer2,
  RefreshCw,
  Route,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import { browserEvidenceRepository } from "../../lib/browser/browserEvidenceRepository";
import {
  createBrowserEvidenceHistory,
  type BrowserEvidenceHistoryItem,
  type BrowserEvidenceHistoryState,
} from "../../lib/browser/browserEvidenceHistory";

const LABELS = {
  navigation_committed: "페이지 이동",
  history_state_updated: "페이지 경로 변경",
  tab_activated: "탭 전환",
};
const timeText = (value: string) => new Date(value).toLocaleString("ko-KR");

export function BrowserEvidenceHistory({ onBack }: { onBack: () => void }) {
  const [history] = useState(() => createBrowserEvidenceHistory(browserEvidenceRepository));
  const state = useSyncExternalStore(history.subscribe, history.getState);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.focus();
    void history.refresh();
  }, [history]);
  const refresh = async () => {
    await history.refresh();
    if (!history.getState().error) list.current?.scrollTo({ top: 0 });
  };
  return (
    <section className="browser-history" aria-labelledby="browser-history-title">
      <header className="browser-history-head">
        <Button icon={ArrowLeft} title="연동으로 돌아가기" variant="ghost" onClick={onBack} />
        <h3 id="browser-history-title" tabIndex={-1} ref={heading}>
          브라우저 활동
        </h3>
        <InfoHint label="브라우저 활동 안내">
          수집이 켜져 있을 때 관찰한 활동입니다. 수집을 꺼도 저장된 활동은 유지됩니다. 새로고침하면
          최신 활동부터 다시 조회합니다. 화면에는 최대 500개를 유지하며, 이전 활동을 더 읽으면 앞서
          본 항목은 화면에서만 빠집니다.
        </InfoHint>
        <Button
          icon={RefreshCw}
          title="활동 새로고침"
          variant="ghost"
          disabled={state.loading === "first"}
          onClick={() => void refresh()}
        />
      </header>
      <div
        ref={list}
        className="browser-history-list base-scroll"
        aria-busy={state.loading !== null}
      >
        {state.omitted > 0 ? (
          <p className="browser-history-status">앞서 본 활동 {state.omitted}개</p>
        ) : null}
        <ol aria-label="관찰된 브라우저 활동">
          {state.items.map((item) => (
            <BrowserActivityRow key={item.key} item={item} />
          ))}
        </ol>
      </div>
      <BrowserHistoryControls
        state={state}
        onOlder={() => void history.loadOlder()}
        onRetry={() => void history.retry()}
      />
    </section>
  );
}

export function BrowserHistoryControls({
  state,
  onOlder,
  onRetry,
}: {
  state: BrowserEvidenceHistoryState;
  onOlder: () => void;
  onRetry: () => void;
}) {
  return (
    <footer className="browser-history-foot">
      {state.error ? (
        <>
          <span role="alert">활동을 불러오지 못했습니다</span>
          <Button icon={RefreshCw} onClick={onRetry}>
            다시 시도
          </Button>
        </>
      ) : state.loading ? (
        <span role="status">
          {state.loading === "older" ? "이전 활동을 불러오는 중..." : "활동을 불러오는 중..."}
        </span>
      ) : !state.loaded ? null : state.items.length === 0 ? (
        <span role="status">저장된 브라우저 활동이 없습니다</span>
      ) : state.nextCursor ? (
        <Button icon={ArrowDown} onClick={onOlder}>
          이전 활동 더 보기
        </Button>
      ) : (
        <span role="status">마지막 활동까지 확인했습니다</span>
      )}
    </footer>
  );
}

export function BrowserActivityRow({ item }: { item: BrowserEvidenceHistoryItem }) {
  const Icon =
    item.kind === "navigation_committed"
      ? Globe
      : item.kind === "history_state_updated"
        ? Route
        : MousePointer2;
  const provider =
    item.provider === "chrome" ? "Chrome" : item.provider === "edge" ? "Edge" : item.provider;
  return (
    <li className="browser-history-row">
      <details>
        <summary>
          <Icon size={16} aria-hidden="true" />
          <span className="browser-history-fact">
            <strong>{LABELS[item.kind]}</strong>
            <span>{item.url ?? "탭 활성화"}</span>
          </span>
          <span className="browser-history-source">{provider}</span>
          <time dateTime={item.observedAt} title={item.observedAt}>
            {timeText(item.observedAt)}
          </time>
          <ChevronRight className="browser-history-expand" size={14} aria-hidden="true" />
        </summary>
        <dl className="browser-history-details">
          <dt>관찰 시각</dt>
          <dd>
            <time dateTime={item.observedAt} title={item.observedAt}>
              {timeText(item.observedAt)}
            </time>
          </dd>
          <dt>Mori 수신 시각</dt>
          <dd>
            <time dateTime={item.receivedAt} title={item.receivedAt}>
              {timeText(item.receivedAt)}
            </time>
          </dd>
          <dt>브라우저</dt>
          <dd>{provider}</dd>
          {item.transitionType ? (
            <>
              <dt>이동 유형</dt>
              <dd>{item.transitionType}</dd>
            </>
          ) : null}
          {item.transitionQualifiers.length ? (
            <>
              <dt>이동 특성</dt>
              <dd>{item.transitionQualifiers.join(", ")}</dd>
            </>
          ) : null}
          {item.runtimeId ? (
            <>
              <dt>브라우저 실행 식별자</dt>
              <dd>{item.runtimeId}</dd>
            </>
          ) : null}
          <dt>탭 식별자</dt>
          <dd>{item.tabId}</dd>
          {item.windowId ? (
            <>
              <dt>창 식별자</dt>
              <dd>{item.windowId}</dd>
            </>
          ) : null}
        </dl>
      </details>
    </li>
  );
}

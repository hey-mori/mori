import { Archive, Link, Search } from "lucide-react";
import { useEffect } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { selectSessionView, useMoriSessionStore } from "../../app/sessionStore";
import { getTrustDisplay } from "../../lib/privacy/trust";
import { ImportPanel } from "../import/ImportPanel";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";

export function SourcesEvidenceView() {
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const view = useMoriSessionStore(selectSessionView);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  return (
    <div className="page">
      <PageHeader
        title="Sources / Evidence"
        subtitle="Mori가 어떤 근거로 이벤트, 이슈, 결정을 만들었는지 확인합니다."
      />
      <SessionModeBanner />
      <ImportPanel />
      {view.sources.length === 0 ? (
        <div className="evidence-empty">
          <Archive size={28} />
          <h2>아직 가져온 소스가 없습니다</h2>
          <p>위의 가져오기 패널에서 메모, URL, AI 대화를 추가하면 여기 표시됩니다.</p>
        </div>
      ) : (
        <div className="evidence-grid">
          {view.sources.map((source) => {
            const trust = getTrustDisplay(source.trustLevel);
            return (
              <article className="evidence-card" key={source.id}>
                <Archive size={22} />
                <Badge tone={trust.tone}>{trust.label}</Badge>
                <h2>{source.title}</h2>
                <p>{source.detail}</p>
                <dl className="source-meta">
                  <div><dt>Kind</dt><dd>{source.kind}</dd></div>
                  <div><dt>Redaction</dt><dd>{source.redactionStatus}</dd></div>
                  <div><dt>Raw data</dt><dd>{source.rawRetention}</dd></div>
                  <div><dt>Events</dt><dd>{source.relatedEventIds.length}</dd></div>
                </dl>
                <div>
                  <Button icon={Search}>원본 보기</Button>
                  <Button icon={Link}>연결 이벤트</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="source-principles">
        <h2>Trust model</h2>
        <p>
          Verified는 git diff, file changed, imported transcript, user note, explicit browser add처럼 원본 근거가 명확한 항목입니다.
          Observed는 active window, terminal command summary, file watcher, browser tab title처럼 관찰되었지만 의미 해석이 필요한 항목입니다.
          Inferred는 AI가 소스와 맥락을 바탕으로 만든 이벤트, 이슈, 결정, 관계입니다.
        </p>
      </div>
    </div>
  );
}

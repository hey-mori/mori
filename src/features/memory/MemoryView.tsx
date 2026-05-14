import { Play, Plus } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { moriMockSession } from "../../domain/mock-data";
import { useMoriAppStore } from "../../app/store";

export function MemoryView() {
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  return (
    <div className="page">
      <PageHeader title="Project Memory" subtitle="Long-term session history across this project" right={<Button icon={Plus}>새 세션</Button>} />
      <div className="project-grid">
        <div className="project-hero">
          <Badge tone="green">Local-first</Badge>
          <h2>{moriMockSession.project.name}</h2>
          <p>{moriMockSession.project.description}</p>
          <div className="resume-metrics">
            <Metric title="세션" value="1" meta="현재 구현된 mock session" />
            <Metric title="열린 이슈" value={moriMockSession.issues.filter((issue) => issue.status !== "resolved").length.toString()} meta="검토 필요" />
            <Metric title="결정" value={moriMockSession.decisions.length.toString()} meta="제품 방향" />
            <Metric title="소스" value={moriMockSession.sources.length.toString()} meta="근거 항목" />
          </div>
          <Button variant="primary" icon={Play} onClick={() => setCurrentView("start")}>Follow-up Session 시작</Button>
        </div>
        <div className="project-list">
          {["Mori 앱 기획", "Claude Code UX 개선", "웹사이트 리뉴얼 조사"].map((sessionTitle, index) => (
            <button key={sessionTitle} onClick={() => setCurrentView("timeline")} type="button">
              <strong>{sessionTitle}</strong>
              <span>2026.05.{12 - index} · {index === 0 ? "04:32:19" : "planned"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value, meta }: { title: string; value: string; meta: string }) {
  return (
    <div className="metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </div>
  );
}

import { Calendar, ClipboardCopy, FileText, PanelRightOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Toggle } from "../../components/ui/Toggle";
import { moriMockSession } from "../../domain/mock-data";
import { createMoriPackageFromSession, serializeMoriPackage } from "../../lib/mori-package";
import { buildResumePrompt } from "../../lib/report/resume-prompt";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { useMoriAppStore } from "../../app/store";

export function ResumeReportView() {
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const prompt = buildResumePrompt(moriMockSession);
  const openIssues = moriMockSession.issues.filter((issue) => issue.status !== "resolved");

  return (
    <div className="page">
      <PageHeader
        title="Resume & Report"
        subtitle="작업을 이어가거나, 공유 가능한 리포트로 정리하세요."
        right={<div className="toolbar"><Button>Mori 앱 기획</Button><Button icon={Calendar}>2026.05.12 13:00 - 18:00</Button></div>}
      />
      <div className="report-layout">
        <section className="resume-area">
          <div className="resume-card">
            <div className="section-heading">
              <div>
                <h2>작업 이어가기 (Resume)</h2>
                <p>다음 AI 세션에 바로 붙여넣을 수 있는 구조화된 컨텍스트입니다.</p>
              </div>
              <Button icon={ClipboardCopy}>Claude/ChatGPT/Codex용 프롬프트 복사</Button>
            </div>
            <div className="resume-metrics">
              <Metric title="마지막 작업" value="회의 메모" meta="16:30" />
              <Metric title="다음 액션" value={moriMockSession.nextActions.length.toString()} meta="높음 2 · 중간 2" />
              <Metric title="열린 이슈" value={openIssues.length.toString()} meta="해결 전 항목" />
              <Metric title="최근 결정" value={moriMockSession.decisions.length.toString()} meta="제품 방향 결정" />
            </div>
            <div className="resume-body">
              <div>
                <h3>이어가기 프롬프트</h3>
                <pre>{prompt}</pre>
              </div>
              <div className="resource-list">
                <h3>관련 리소스 빠르게 열기</h3>
                {moriMockSession.artifacts.map((artifact) => (
                  <button key={artifact.id} type="button">
                    <FileText size={16} />
                    {artifact.title}
                    <small>{artifact.path}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flow-summary">
            <div className="section-heading">
              <h2>오늘의 작업 흐름 요약</h2>
              <Button icon={PanelRightOpen} onClick={() => setCurrentView("timeline")}>타임라인 열기</Button>
            </div>
            <div className="report-summary-list">
              {moriMockSession.events.slice(0, 8).map((event) => (
                <div key={event.id}>
                  <strong>{event.title}</strong>
                  <span>{event.summary}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <ReportBuilder />
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

function ReportBuilder() {
  const reportTypes = ["Personal retrospective", "Team share", "Client report", "Dev standup", "Billing work log", "Custom report"];
  const include = ["Summary", "Timeline", "Decisions", "Issues", "File changes", "AI conversations", "Web/research", "Next actions"];
  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const [exportStatus, setExportStatus] = useState<string>("Ready to export .mori v0 JSON");

  function handleExportMoriJson() {
    const pkg = createMoriPackageFromSession(moriMockSession);
    const serialized = serializeMoriPackage(pkg);
    repository.saveMoriPackageDraft(pkg);
    downloadTextFile(`${pkg.manifest.packageId}.mori.json`, serialized, "application/vnd.mori.package+json");
    setExportStatus(`Exported ${pkg.manifest.packageId} and saved browser draft`);
  }

  return (
    <aside className="report-builder">
      <div className="report-tabs">
        <button className="active" type="button">리포트 만들기</button>
        <button type="button">내보낸 리포트</button>
      </div>
      <h3>1. 리포트 유형 선택</h3>
      <div className="report-type-grid">
        {reportTypes.map((type, index) => (
          <button className={index === 0 ? "selected" : ""} key={type} type="button">
            <FileText size={18} />
            <strong>{type}</strong>
            <small>{index === 0 ? "내 작업 회고 및 정리" : "공유 대상에 맞는 보고서"}</small>
          </button>
        ))}
      </div>
      <h3>2. 포함 항목 선택</h3>
      <div className="check-list">
        {include.map((item, index) => (
          <label key={item}>
            <input type="checkbox" defaultChecked={index !== 5} />
            {item}
          </label>
        ))}
      </div>
      <h3>3. 출력 형식</h3>
      <div className="format-grid">
        <button className="selected" type="button">Markdown <small>.md</small></button>
        <button type="button">PDF <small>placeholder</small></button>
        <button type="button">HTML <small>placeholder</small></button>
      </div>
      <h3>프라이버시 옵션</h3>
      <div className="toggle-row"><span>민감 정보 자동 제거</span><Toggle active /></div>
      <div className="toggle-row"><span>AI 대화 원문 제외</span><Toggle active /></div>
      <div className="toggle-row"><span>파일 경로 마스킹</span><Toggle /></div>
      <div className="toggle-row"><span>.mori 파일 첨부</span><Toggle /></div>
      <div className="draft-status-panel">
        <strong>.mori package status</strong>
        <span>{exportStatus}</span>
        <span>Storage adapter: browser localStorage draft</span>
        <span>Format: v0.1.0 JSON, zip-like package later</span>
      </div>
      <Button variant="primary" icon={FileText} onClick={handleExportMoriJson}>Export .mori v0 JSON</Button>
      <Button icon={Search}>미리보기</Button>
    </aside>
  );
}

function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

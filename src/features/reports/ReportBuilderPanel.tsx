import { Check, ClipboardCopy, Download, FileText, Lock, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BaseActionCluster } from "../../components/ui/BaseActionCluster";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { InfoHint } from "../../components/ui/InfoHint";
import { Toggle } from "../../components/ui/Toggle";
import type { MockSession } from "../../domain/types";
import type { StoredAcceptedProjectMemory } from "../../lib/storage/storageTypes";
import { buildMemoryClientSafeBreakdown } from "../../lib/mori-package";
import {
  buildReportMarkdown,
  REPORT_TYPE_DEFINITIONS,
  SECTION_DEFINITIONS,
  toggleSection,
  type ReportFormat,
  type ReportPrivacyOptions,
  type ReportSectionId,
  type ReportType,
} from "../../lib/report/reportBuilder";
import { buildReportHtmlDocument } from "../../lib/report/reportHtml";
import { getFeatureControlProps, type FeatureId } from "../../app/featureStatus";

// Format status is sourced from the feature registry so the panel can never
// drift from `docs/feature-status.md` or the rest of the app.
const FORMAT_DEFS: Array<{
  id: ReportFormat;
  label: string;
  ext: string;
  featureId: FeatureId;
}> = [
  { id: "markdown", label: "Markdown", ext: ".md", featureId: "reports.export.markdown" },
  { id: "pdf", label: "PDF", ext: ".pdf", featureId: "reports.export.pdf" },
  { id: "html", label: "HTML", ext: ".html", featureId: "reports.export.html" },
];

export function ReportBuilderPanel({
  id,
  view,
  resumePromptOverride,
  acceptedMemories,
}: {
  id?: string;
  view: MockSession;
  resumePromptOverride?: string;
  acceptedMemories?: readonly StoredAcceptedProjectMemory[];
}) {
  const [type, setType] = useState<ReportType>("personalRetrospective");
  const typeDef = useMemo(
    () => REPORT_TYPE_DEFINITIONS.find((entry) => entry.id === type) ?? REPORT_TYPE_DEFINITIONS[0],
    [type],
  );
  const [sections, setSections] = useState<ReadonlySet<ReportSectionId>>(
    () => new Set(typeDef.defaultSections),
  );
  const [privacy, setPrivacy] = useState<ReportPrivacyOptions>(typeDef.defaultPrivacy);
  const [format, setFormat] = useState<ReportFormat>("markdown");
  const [copiedMd, setCopiedMd] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(true);

  function handleTypeChange(nextType: ReportType) {
    setType(nextType);
    const def = REPORT_TYPE_DEFINITIONS.find((entry) => entry.id === nextType);
    if (def) {
      setSections(new Set(def.defaultSections));
      setPrivacy(def.defaultPrivacy);
    }
  }

  function handleToggleSection(id: ReportSectionId) {
    setSections((current) => toggleSection(current, id));
  }

  function setPrivacyKey<K extends keyof ReportPrivacyOptions>(key: K, value: ReportPrivacyOptions[K]) {
    setPrivacy((current) => ({ ...current, [key]: value }));
  }

  const payload = useMemo(
    () =>
      buildReportMarkdown({
        view,
        type,
        sections,
        privacy,
        resumePromptOverride,
        acceptedMemories,
      }),
    [view, type, sections, privacy, resumePromptOverride, acceptedMemories],
  );

  async function handleCopyMarkdown() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(payload.markdown);
      }
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 1800);
    } catch {
      setCopiedMd(false);
    }
  }

  function handleDownload() {
    if (typeof window === "undefined") return;
    const isHtml = format === "html";
    const content = isHtml
      ? buildReportHtmlDocument({ markdown: payload.markdown, title: view.session.title })
      : payload.markdown;
    const blob = new Blob([content], {
      type: isHtml ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${view.session.title.replace(/\s+/g, "_")}-${type}${isHtml ? ".html" : ".md"}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <aside id={id} className="report-builder-panel" aria-label="Report builder">
      <header className="report-builder-head">
        <div>
          <h2>리포트 생성기</h2>
          <p>리포트 유형 / 섹션 / 형식을 선택하면 미리보기가 실시간으로 갱신됩니다.</p>
        </div>
      </header>

      <section className="report-builder-section">
        <SectionHeader title="1. 리포트 유형" hint={typeDef.audience} />
        <div className="report-type-list">
          {REPORT_TYPE_DEFINITIONS.map((def) => (
            <button
              key={def.id}
              type="button"
              className={`report-type-card ${type === def.id ? "selected" : ""}`}
              onClick={() => handleTypeChange(def.id)}
              aria-pressed={type === def.id}
            >
              <FileText size={14} aria-hidden="true" />
              <div>
                <strong>{def.label}</strong>
                <small>{def.description}</small>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="report-builder-section">
        <SectionHeader title="2. 포함 섹션" hint={`${sections.size} / ${SECTION_DEFINITIONS.length}`} />
        <ul className="report-section-list">
          {SECTION_DEFINITIONS.map((def) => (
            <li key={def.id}>
              <label>
                <input
                  type="checkbox"
                  checked={sections.has(def.id)}
                  onChange={() => handleToggleSection(def.id)}
                />
                <span>
                  <strong>{def.label}</strong>
                  <small>{def.description}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="report-builder-section">
        <SectionHeader title="3. 출력 형식" hint="Markdown만 활성화" />
        <div className="report-format-list">
          {FORMAT_DEFS.map((def) => {
            const feature = getFeatureControlProps(def.featureId);
            const disabled = !feature.enabled;
            return (
              <button
                key={def.id}
                type="button"
                className={`report-format-button ${format === def.id ? "selected" : ""} ${
                  disabled ? "is-disabled" : ""
                }`}
                onClick={() => !disabled && setFormat(def.id)}
                disabled={disabled}
                aria-pressed={format === def.id}
                title={feature.title ?? `${def.label} 형식 선택`}
              >
                <strong>{def.label}</strong>
                <small>
                  {def.ext} · {feature.statusLabel}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="report-builder-section">
        <SectionHeader
          title="4. 공유 안전"
          hint="보고서에는 원문 대화 · 파일 경로 · 민감 속성을 직접 포함하지 않습니다."
          right={
            <InfoHint label="공유 안전 설명">
              지금은 토글에 해당하는 섹션만 제외합니다. 개인 식별 정보 자동 마스킹은 다음 마일스톤입니다.
            </InfoHint>
          }
        />
        <ul className="report-privacy-list">
          <li>
            <span>
              <Lock size={12} aria-hidden="true" /> 외부 공유용으로 정리
              <small>원문 대화 · 출처 상세 · 파일 경로 제외</small>
              <ClientSafeBadge memories={acceptedMemories} />
            </span>
            <Toggle
              active={privacy.clientSafe}
              onClick={() => setPrivacyKey("clientSafe", !privacy.clientSafe)}
            />
          </li>
        </ul>
        <details className="report-privacy-advanced base-disclosure">
          <summary>
            <span>세부 옵션</span>
            <small>제외 범위를 직접 고르고 싶을 때</small>
          </summary>
          <ul className="report-privacy-list">
            <li>
              <span>
                AI 대화 원문 제외
                <small>요약과 메타데이터만 사용</small>
              </span>
              <Toggle
                active={privacy.excludeRawTranscripts}
                onClick={() => setPrivacyKey("excludeRawTranscripts", !privacy.excludeRawTranscripts)}
              />
            </li>
            <li>
              <span>
                출처 상세 제외
                <small>Evidence 섹션에서 소스 제목을 숨김</small>
              </span>
              <Toggle
                active={privacy.excludeSourceDetails}
                onClick={() => setPrivacyKey("excludeSourceDetails", !privacy.excludeSourceDetails)}
              />
            </li>
          </ul>
        </details>
      </section>

      <section className="report-builder-section">
        <SectionHeader title="5. 미리보기 / 내보내기" hint={`이벤트 ${payload.counts.events} · 이슈 ${payload.counts.issues} · 결정 ${payload.counts.decisions}`} />
        <BaseActionCluster className="report-builder-actions">
          <Button
            variant="primary"
            icon={copiedMd ? Check : ClipboardCopy}
            size="sm"
            onClick={handleCopyMarkdown}
          >
            {copiedMd ? "복사됨" : "Markdown 복사"}
          </Button>
          <Button icon={Download} size="sm" onClick={handleDownload}>
            {format === "html" ? ".html 다운로드" : ".md 다운로드"}
          </Button>
          <Button size="sm" onClick={() => setPreviewVisible((value) => !value)}>
            {previewVisible ? "미리보기 숨기기" : "미리보기 보기"}
          </Button>
        </BaseActionCluster>
        {payload.warnings.length > 0 ? (
          <ul className="report-warnings">
            {payload.warnings.map((warning) => (
              <li key={warning}>
                <Sparkles size={11} aria-hidden="true" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {previewVisible ? (
          <pre className="report-preview" aria-label="Markdown preview">
            {payload.markdown}
          </pre>
        ) : null}
        <p className="report-data-basis">
          <Badge tone="gray">데이터 기준</Badge> {payload.dataBasis}
        </p>
      </section>
    </aside>
  );
}

/**
 * Inline summary under the "클라이언트 안전 모드" toggle so the user can see at
 * a glance how the client-safe filter would slice the project's accepted
 * memory. The breakdown mirrors `buildClientSafeMoriPackage` exactly, with
 * separate counts for tier-excluded and sensitivity-excluded memories so the
 * user can act on the right field. Renders nothing when there is no accepted
 * memory yet — the toggle stays calm until there is something to filter.
 */
function ClientSafeBadge({
  memories,
}: {
  memories?: readonly StoredAcceptedProjectMemory[];
}) {
  if (!memories || memories.length === 0) return null;
  const breakdown = buildMemoryClientSafeBreakdown(memories);
  if (breakdown.included === 0 && breakdown.totalExcluded === 0) return null;
  const exclusionDetail: string[] = [];
  if (breakdown.excludedTier > 0) {
    exclusionDetail.push(`팀/개인 등급 ${breakdown.excludedTier}`);
  }
  if (breakdown.excludedSensitive > 0) {
    exclusionDetail.push(`민감 ${breakdown.excludedSensitive}`);
  }
  return (
    <span className="report-privacy-clientsafe">
      <Badge tone="green">공유 가능 {breakdown.included}</Badge>
      {breakdown.totalExcluded > 0 ? (
        <Badge
          tone="gray"
          title={exclusionDetail.length > 0 ? exclusionDetail.join(" · ") : undefined}
        >
          제외 {breakdown.totalExcluded}
        </Badge>
      ) : null}
    </span>
  );
}

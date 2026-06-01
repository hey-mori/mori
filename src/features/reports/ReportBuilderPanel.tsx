import { Check, ClipboardCopy, Download, FileText, ListChecks, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { BaseActionCluster } from "../../components/ui/BaseActionCluster";
import { BaseChecklistSelect, type BaseChecklistOption } from "../../components/ui/BaseChecklistSelect";
import { BaseSelect, type BaseSelectOption } from "../../components/ui/BaseSelect";
import type { MockSession } from "../../domain/types";
import type { StoredAcceptedProjectMemory } from "../../lib/storage/storageTypes";
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
import { renderReportMarkdownToHtml } from "../../lib/report/reportHtml";
import { getFeatureControlProps, type FeatureId } from "../../app/featureStatus";

// Format status is sourced from the feature registry so the panel can never
// drift from `docs/feature-status.md` or the rest of the app.
const FORMAT_DEFS: Array<{
  id: ReportFormat;
  label: string;
  ext: string;
  featureId: FeatureId;
}> = [
  { id: "markdown", label: "MD", ext: ".md", featureId: "reports.export.markdown" },
  { id: "txt", label: "TXT", ext: ".txt", featureId: "reports.export.txt" },
  { id: "pdf", label: "PDF", ext: ".pdf", featureId: "reports.export.pdf" },
  { id: "html", label: "HTML", ext: ".html", featureId: "reports.export.html" },
];

const REPORT_TYPE_OPTIONS: Array<BaseSelectOption<ReportType>> = REPORT_TYPE_DEFINITIONS.map((def) => ({
  id: def.id,
  label: def.label,
  description: def.audience,
  icon: FileText,
}));

const FORMAT_OPTIONS: Array<BaseSelectOption<ReportFormat>> = FORMAT_DEFS.map((def) => {
  const feature = getFeatureControlProps(def.featureId);
  return {
    id: def.id,
    label: def.label,
    description: feature.statusLabel,
    icon: FileText,
    disabled: !feature.enabled,
  };
});

const SECTION_OPTIONS: Array<BaseChecklistOption<ReportSectionId>> = SECTION_DEFINITIONS.map((def) => ({
  id: def.id,
  label: def.label,
  description: def.description,
}));

type PrivacyOptionId = keyof ReportPrivacyOptions;

const PRIVACY_OPTIONS: Array<BaseChecklistOption<PrivacyOptionId>> = [
  {
    id: "clientSafe",
    label: "외부 공유용",
    description: "원문 대화·출처 상세·파일 경로 노출을 줄입니다.",
  },
  {
    id: "excludeRawTranscripts",
    label: "AI 대화 원문 제외",
    description: "요약과 메타데이터만 사용합니다.",
  },
  {
    id: "excludeSourceDetails",
    label: "출처 상세 제외",
    description: "Evidence 섹션에서 소스 제목을 숨깁니다.",
  },
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
    const isText = format === "txt";
    const content = isHtml
      ? buildReportHtmlDocument({ markdown: payload.markdown, title: view.session.title })
      : isText
        ? buildReportTextDocument(payload.markdown)
      : payload.markdown;
    const blob = new Blob([content], {
      type: isHtml
        ? "text/html;charset=utf-8"
        : isText
          ? "text/plain;charset=utf-8"
          : "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${view.session.title.replace(/\s+/g, "_")}-${type}${selectedFormat.ext}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  const selectedFormat = FORMAT_DEFS.find((entry) => entry.id === format) ?? FORMAT_DEFS[0];
  const previewHtml = useMemo(() => renderReportMarkdownToHtml(payload.markdown), [payload.markdown]);
  const activePrivacyCount =
    Number(privacy.clientSafe) +
    Number(privacy.excludeRawTranscripts) +
    Number(privacy.excludeSourceDetails);

  return (
    <aside id={id} className="report-builder-panel base-scroll" aria-label="보고서 작성">
      <div className="report-builder-workbench">
        <div className="report-builder-controls">
          <ReportTypeField type={type} onChange={handleTypeChange} />

          <ReportFormatPicker format={format} onChange={setFormat} />

          <ReportPrivacyPicker
            activePrivacyCount={activePrivacyCount}
            privacy={privacy}
            setPrivacyKey={setPrivacyKey}
          />

          <ReportSectionPicker sections={sections} onToggle={handleToggleSection} />
        </div>

        <section className="report-preview-pane" aria-label="보고서 미리보기">
          <header>
            <strong>미리보기</strong>
            <BaseActionCluster className="report-builder-actions">
              <Button
                variant="primary"
                icon={copiedMd ? Check : ClipboardCopy}
                size="sm"
                onClick={handleCopyMarkdown}
              >
                {copiedMd ? "복사됨" : "복사"}
              </Button>
              <Button icon={Download} size="sm" onClick={handleDownload}>
                저장
              </Button>
            </BaseActionCluster>
          </header>
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
          <div className="report-preview base-scroll" aria-label="보고서 미리보기 본문">
            <div
              className="report-rendered-preview"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </section>
      </div>
    </aside>
  );
}

function ReportFormatPicker({
  format,
  onChange,
}: {
  format: ReportFormat;
  onChange: (format: ReportFormat) => void;
}) {
  return (
    <div className="report-builder-field">
      <span>형식</span>
      <BaseSelect
        value={format}
        options={FORMAT_OPTIONS}
        onChange={onChange}
        label="출력 형식"
      />
    </div>
  );
}

function ReportTypeField({
  type,
  onChange,
}: {
  type: ReportType;
  onChange: (type: ReportType) => void;
}) {
  return (
    <label className="report-builder-field report-builder-field-type">
      <span>보고서</span>
      <BaseSelect
        value={type}
        options={REPORT_TYPE_OPTIONS}
        onChange={onChange}
        label="보고서 유형"
        className="report-type-select"
      />
    </label>
  );
}

function ReportPrivacyPicker({
  activePrivacyCount,
  privacy,
  setPrivacyKey,
}: {
  activePrivacyCount: number;
  privacy: ReportPrivacyOptions;
  setPrivacyKey: <K extends keyof ReportPrivacyOptions>(key: K, value: ReportPrivacyOptions[K]) => void;
}) {
  const selected = new Set(
    PRIVACY_OPTIONS
      .filter((option) => privacy[option.id])
      .map((option) => option.id),
  );
  const valueLabel = activePrivacyCount === 0
    ? "내부용"
    : privacy.clientSafe
      ? `외부용 · ${activePrivacyCount}개 제한`
      : `${activePrivacyCount}개 제한`;
  return (
    <div className="report-builder-field">
      <span>공유 범위</span>
      <BaseChecklistSelect
        label="공유 범위 옵션"
        valueLabel={valueLabel}
        options={PRIVACY_OPTIONS}
        selectedIds={selected}
        onToggle={(id) => setPrivacyKey(id, !privacy[id])}
        icon={ShieldCheck}
      />
    </div>
  );
}

function ReportSectionPicker({
  sections,
  onToggle,
}: {
  sections: ReadonlySet<ReportSectionId>;
  onToggle: (id: ReportSectionId) => void;
}) {
  return (
    <div className="report-builder-field">
      <span>섹션</span>
      <BaseChecklistSelect
        label="포함 섹션"
        valueLabel={`${sections.size}개 선택`}
        options={SECTION_OPTIONS}
        selectedIds={sections}
        onToggle={onToggle}
        icon={ListChecks}
      />
    </div>
  );
}

function buildReportTextDocument(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .concat("\n");
}

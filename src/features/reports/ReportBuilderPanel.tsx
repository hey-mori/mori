import { Check, ClipboardCopy, Download, FileText, ListChecks, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { BaseActionCluster } from "../../components/ui/BaseActionCluster";
import { BaseChecklistSelect, type BaseChecklistOption } from "../../components/ui/BaseChecklistSelect";
import { BaseSelect, type BaseSelectOption } from "../../components/ui/BaseSelect";
import { InfoHint } from "../../components/ui/InfoHint";
import { Toggle } from "../../components/ui/Toggle";
import type { MockSession } from "../../domain/types";
import type { StoredAcceptedProjectMemory } from "../../lib/storage/storageTypes";
import {
  buildReportMarkdown,
  SECTION_DEFINITIONS,
  toggleSection,
  type ReportFormat,
  type ReportPrivacyOptions,
  type ReportSectionId,
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

// 보고서 유형 ("템플릿") was a section-preset that locked the user into one
// audience's defaults. The selector is gone — sections start with every
// section enabled and the user decides what to drop. The internal "type"
// stays at `personalRetrospective` (the most permissive audience) so the
// underlying `buildReportMarkdown` contract is unchanged; the single 외부
// 공유용 toggle drives the real share-scope filtering downstream.
const DEFAULT_REPORT_TYPE = "personalRetrospective" as const;
const DEFAULT_SECTIONS: ReadonlySet<ReportSectionId> = new Set(
  SECTION_DEFINITIONS.map((def) => def.id),
);

// "공유 정책" used to fan out into three independent toggles (clientSafe /
// excludeRawTranscripts / excludeSourceDetails). One global "외부 공유"
// switch is enough: when on, all three privacy gates fire together so the
// rendered report and the .mori export are both client-safe. When off, none
// fire — the report is the user's own internal copy.
function buildPrivacyFromShare(externalShare: boolean): ReportPrivacyOptions {
  return externalShare
    ? { clientSafe: true, excludeRawTranscripts: true, excludeSourceDetails: true }
    : { clientSafe: false, excludeRawTranscripts: false, excludeSourceDetails: false };
}

export function ReportBuilderPanel({
  id,
  view,
  resumePromptOverride,
  acceptedMemories,
  externalShare,
  onToggleExternalShare,
}: {
  id?: string;
  view: MockSession;
  resumePromptOverride?: string;
  acceptedMemories?: readonly StoredAcceptedProjectMemory[];
  /** Single 공유 정책 toggle lifted to `ReportsView` so the .mori strip and
   *  the report copy stay in sync. */
  externalShare: boolean;
  onToggleExternalShare: () => void;
}) {
  const [sections, setSections] = useState<ReadonlySet<ReportSectionId>>(
    () => new Set(DEFAULT_SECTIONS),
  );
  const [format, setFormat] = useState<ReportFormat>("markdown");
  const [copiedMd, setCopiedMd] = useState(false);

  function handleToggleSection(id: ReportSectionId) {
    setSections((current) => toggleSection(current, id));
  }

  const privacy = useMemo(() => buildPrivacyFromShare(externalShare), [externalShare]);

  const payload = useMemo(
    () =>
      buildReportMarkdown({
        view,
        type: DEFAULT_REPORT_TYPE,
        sections,
        privacy,
        resumePromptOverride,
        acceptedMemories,
      }),
    [view, sections, privacy, resumePromptOverride, acceptedMemories],
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
    anchor.download = `${view.session.title.replace(/\s+/g, "_")}-${DEFAULT_REPORT_TYPE}${selectedFormat.ext}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  const selectedFormat = FORMAT_DEFS.find((entry) => entry.id === format) ?? FORMAT_DEFS[0];
  const previewHtml = useMemo(() => renderReportMarkdownToHtml(payload.markdown), [payload.markdown]);

  // The "Client-safe 모드: …" notice is now covered by the InfoHint next to
  // the 외부 공유 toggle, so it never needs to clutter the preview area.
  const visibleWarnings = useMemo(
    () => payload.warnings.filter((warning) => !warning.startsWith("Client-safe 모드")),
    [payload.warnings],
  );

  return (
    <div id={id} className="report-builder" aria-label="보고서 작성">
      <header className="tab-toolbar report-builder-toolbar" role="toolbar" aria-label="보고서 옵션">
        <ReportSectionPicker sections={sections} onToggle={handleToggleSection} />
        <ReportFormatPicker format={format} onChange={setFormat} />
        <span className={`report-share-toggle ${externalShare ? "is-active" : ""}`}>
          <Toggle
            active={externalShare}
            label="외부 공유"
            onClick={onToggleExternalShare}
          />
          <span className="report-share-toggle-label">외부 공유</span>
          <InfoHint label="외부 공유 설명">
            외부 공유로 두면 원본 대화, 출처 상세, 파일 경로가 보고서와 .mori 패키지에서 빠집니다.
          </InfoHint>
        </span>
        <span className="tab-toolbar-spacer" aria-hidden="true" />
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
      <section className="report-preview-shell" aria-label="보고서 미리보기">
        {visibleWarnings.length > 0 ? (
          <ul className="report-warnings">
            {visibleWarnings.map((warning) => (
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

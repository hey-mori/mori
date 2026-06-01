import { Check, ClipboardCopy, Download, FileText, ListChecks, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { BaseActionCluster } from "../../components/ui/BaseActionCluster";
import { BaseChecklistSelect, type BaseChecklistOption } from "../../components/ui/BaseChecklistSelect";
import { BaseSelect, type BaseSelectOption } from "../../components/ui/BaseSelect";
import { Toggle } from "../../components/ui/Toggle";
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
// underlying `buildReportMarkdown` contract is unchanged; privacy toggles
// do the real share-scope filtering downstream.
const DEFAULT_REPORT_TYPE = "personalRetrospective" as const;
const DEFAULT_SECTIONS: ReadonlySet<ReportSectionId> = new Set(
  SECTION_DEFINITIONS.map((def) => def.id),
);
const DEFAULT_PRIVACY: ReportPrivacyOptions =
  REPORT_TYPE_DEFINITIONS.find((entry) => entry.id === DEFAULT_REPORT_TYPE)
    ?.defaultPrivacy
    ?? { clientSafe: false, excludeRawTranscripts: false, excludeSourceDetails: false };

const PRIVACY_TOGGLES: Array<{
  id: keyof ReportPrivacyOptions;
  label: string;
  hint: string;
}> = [
  {
    id: "clientSafe",
    label: "외부 공유용",
    hint: "원문 대화·출처 상세·파일 경로 노출을 줄입니다.",
  },
  {
    id: "excludeRawTranscripts",
    label: "AI 대화 원문 제외",
    hint: "요약과 메타데이터만 사용합니다.",
  },
  {
    id: "excludeSourceDetails",
    label: "출처 상세 제외",
    hint: "Evidence 섹션에서 소스 제목을 숨깁니다.",
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
  const [sections, setSections] = useState<ReadonlySet<ReportSectionId>>(
    () => new Set(DEFAULT_SECTIONS),
  );
  const [privacy, setPrivacy] = useState<ReportPrivacyOptions>(DEFAULT_PRIVACY);
  const [format, setFormat] = useState<ReportFormat>("markdown");
  const [copiedMd, setCopiedMd] = useState(false);

  function handleToggleSection(id: ReportSectionId) {
    setSections((current) => toggleSection(current, id));
  }

  function togglePrivacyKey<K extends keyof ReportPrivacyOptions>(key: K) {
    setPrivacy((current) => ({ ...current, [key]: !current[key] }));
  }

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

  return (
    <aside id={id} className="report-builder-panel base-scroll" aria-label="보고서 작성">
      <div className="report-builder-workbench">
        <div className="report-builder-controls">
          <div className="report-builder-row">
            <ReportSectionPicker sections={sections} onToggle={handleToggleSection} />
            <ReportFormatPicker format={format} onChange={setFormat} />
          </div>

          <ReportPrivacyToggles privacy={privacy} onToggle={togglePrivacyKey} />
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

/**
 * Privacy controls used to live in a dropdown labelled "공유 범위", which
 * mixed two ideas (the value label tried to summarise a count of restrictions)
 * and required a click to see what was on. Inline toggles make the state
 * always visible, calmer, and one tap to flip.
 */
function ReportPrivacyToggles({
  privacy,
  onToggle,
}: {
  privacy: ReportPrivacyOptions;
  onToggle: <K extends keyof ReportPrivacyOptions>(key: K) => void;
}) {
  return (
    <fieldset className="report-privacy-toggles" aria-label="공유 안전">
      <legend>공유 안전</legend>
      <ul>
        {PRIVACY_TOGGLES.map((entry) => {
          const active = Boolean(privacy[entry.id]);
          return (
            <li key={entry.id} className={active ? "is-active" : ""}>
              <div className="report-privacy-toggle-copy">
                <strong>{entry.label}</strong>
                <small>{entry.hint}</small>
              </div>
              <Toggle
                active={active}
                label={entry.label}
                onClick={() => onToggle(entry.id)}
              />
            </li>
          );
        })}
      </ul>
    </fieldset>
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

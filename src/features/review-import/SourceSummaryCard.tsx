import { FileText } from "lucide-react";
import { InfoHint } from "../../components/ui/InfoHint";
import type { SourceRef } from "../../domain/types";
import { getSourceDisplayStatus } from "../../lib/sources/traceability";
import { formatDateTime } from "../../lib/formatting/time";

/**
 * The one source this review is about, as a single calm strip: icon, title, a
 * quiet meta line (where it came from · how it was captured · when), and an
 * info hint that holds the retention / privacy detail on hover.
 *
 * The old version stacked a four-badge row (integration · trust · fidelity ·
 * status), a labelled definition list, and a full privacy paragraph. None of
 * that is a decision the reviewer makes, so it moves out of always-visible copy
 * into the hint, per the copy-diet rule.
 */
export function SourceSummaryCard({ source }: { source: SourceRef }) {
  const display = getSourceDisplayStatus(source);
  const meta = [display.integrationLabel, display.captureMethod, formatTime(source.capturedAt)]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="review-source-strip" aria-label="가져온 자료">
      <span className="review-source-strip-icon" aria-hidden="true">
        <FileText size={16} />
      </span>
      <div className="review-source-strip-main">
        <strong>{source.title}</strong>
        <span>{meta}</span>
      </div>
      <InfoHint label="보관 · 개인정보 정책">
        <strong>{display.rawDataLabel}</strong>
        <br />
        {display.privacyNote}
      </InfoHint>
    </section>
  );
}

function formatTime(iso: string): string {
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

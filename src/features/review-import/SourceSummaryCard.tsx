import { CalendarClock, FileText, Lock } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { SectionHeader } from "../../components/ui/SectionHeader";
import type { SourceRef } from "../../domain/types";
import { getSourceDisplayStatus } from "../../lib/sources/traceability";

const STATUS_TONE: Record<string, "green" | "blue" | "gray" | "orange"> = {
  implemented: "green",
  partial: "blue",
  planned: "gray",
  mockOnly: "orange",
  unavailable: "gray",
};

export function SourceSummaryCard({ source }: { source: SourceRef }) {
  const display = getSourceDisplayStatus(source);

  return (
    <section className="review-source-card" aria-label="Reviewed source summary">
      <header className="review-source-card-head">
        <span className="review-source-card-icon">
          <FileText size={18} />
        </span>
        <div className="review-source-card-titles">
          <strong>{source.title}</strong>
          <span>{source.detail}</span>
        </div>
      </header>

      <div className="review-source-card-badges">
        <Badge tone="purple">{display.integrationLabel}</Badge>
        <Badge tone={display.trustTone}>{display.trustLabel}</Badge>
        <Badge tone={STATUS_TONE[display.status] ?? "gray"}>{display.statusLabel}</Badge>
      </div>

      <SectionHeader title="가져오기 정보" />
      <dl className="review-source-card-grid">
        <div>
          <dt>Capture method</dt>
          <dd>{display.captureMethod}</dd>
        </div>
        <div>
          <dt>Raw retention</dt>
          <dd>{display.rawDataLabel}</dd>
        </div>
        <div>
          <dt>
            <CalendarClock size={11} aria-hidden="true" /> Imported
          </dt>
          <dd>{formatTime(source.capturedAt)}</dd>
        </div>
        {source.uri ? (
          <div>
            <dt>Origin / URI</dt>
            <dd className="review-source-card-uri">{source.uri}</dd>
          </div>
        ) : null}
      </dl>

      <SectionHeader title="개인정보 정책" />
      <p className="review-source-card-privacy">
        <Lock size={12} aria-hidden="true" />
        <span>{display.privacyNote}</span>
      </p>
    </section>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

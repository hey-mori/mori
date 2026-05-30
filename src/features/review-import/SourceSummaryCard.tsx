import { CalendarClock, FileText, Lock } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import { BaseTrustBadge } from "../../components/ui/BaseTrustBadge";
import { BaseFidelityBadge } from "../../components/ui/BaseFidelityBadge";
import { SectionHeader } from "../../components/ui/SectionHeader";
import type { SourceRef } from "../../domain/types";
import { getSourceDisplayStatus } from "../../lib/sources/traceability";
import { formatDateTime } from "../../lib/formatting/time";
import {
  getProductAvailabilityTone,
  productAvailabilityFromIntegrationStatus,
} from "../../lib/product-state/productState";

export function SourceSummaryCard({ source }: { source: SourceRef }) {
  const display = getSourceDisplayStatus(source);

  return (
    <section className="review-source-card" aria-label="검토된 자료 요약">
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
        <BaseTrustBadge level={source.trustLevel} />
        <BaseFidelityBadge fidelity={source.captureFidelity} />
        <BaseStatusBadge
          tone={getProductAvailabilityTone(
            productAvailabilityFromIntegrationStatus(display.status),
          )}
        >
          {display.statusLabel}
        </BaseStatusBadge>
      </div>

      <SectionHeader title="가져오기 정보" />
      <dl className="review-source-card-grid">
        <div>
          <dt>캡처 방식</dt>
          <dd>{display.captureMethod}</dd>
        </div>
        <div>
          <dt>원본 보관 정책</dt>
          <dd>{display.rawDataLabel}</dd>
        </div>
        <div>
          <dt>
            <CalendarClock size={11} aria-hidden="true" /> 가져온 시각
          </dt>
          <dd>{formatTime(source.capturedAt)}</dd>
        </div>
        {source.uri ? (
          <div>
            <dt>출처 / URI</dt>
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
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

import { ChevronRight, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { SourceRef, TimelineEvent } from "../../domain/types";
import { getSourceDisplayStatus } from "../../lib/sources/traceability";
import {
  describeConnectorSourceImportBadge,
  getConnectorSourceImportBadgeTone,
  type ConnectorSourceImportSummary,
} from "../../lib/connectors";

export function ImportedSourceRow({
  source,
  events,
  selected,
  importSummary,
  onSelect,
  onRemove,
}: {
  source: SourceRef;
  events: TimelineEvent[];
  selected: boolean;
  /**
   * Optional source-level re-import summary captured at import time.
   * Only present for connector JSONL imports that ran through the
   * cross-session preview path. The row degrades cleanly to no badge
   * when the field is absent (every import that landed before this
   * milestone falls into that bucket).
   */
  importSummary?: ConnectorSourceImportSummary;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const display = getSourceDisplayStatus(source);
  const relatedEventCount = events.filter((event) => event.sourceRefs.includes(source.id)).length;
  const summaryBadge =
    importSummary && importSummary.status !== "unknown"
      ? {
          tone: getConnectorSourceImportBadgeTone(importSummary),
          label: describeConnectorSourceImportBadge(importSummary),
        }
      : null;

  return (
    <article
      className={`imported-source-row ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      <button type="button" className="imported-source-body" onClick={onSelect}>
        <div className="imported-source-titles">
          <strong title={source.title}>{source.title}</strong>
          <span className="imported-source-detail">{source.detail}</span>
        </div>
        <div className="imported-source-meta">
          <Badge tone="purple">{display.integrationLabel}</Badge>
          <Badge tone={display.trustTone}>{display.trustLabel}</Badge>
          <Badge tone={rawTone(display.rawDataLabel)}>{display.rawDataLabel}</Badge>
          {summaryBadge ? <Badge tone={summaryBadge.tone}>{summaryBadge.label}</Badge> : null}
          <span className="imported-source-events">
            {relatedEventCount} event{relatedEventCount === 1 ? "" : "s"}
          </span>
        </div>
        <ChevronRight size={14} aria-hidden="true" className="imported-source-chevron" />
      </button>
      {onRemove ? (
        <Button icon={Trash2} onClick={onRemove} aria-label="가져온 소스 제거" title="가져온 소스 제거" />
      ) : null}
    </article>
  );
}

function rawTone(label: string): string {
  if (label === "Full data retained") return "blue";
  if (label === "Summary only") return "orange";
  if (label === "Redacted") return "purple";
  if (label === "Not captured") return "gray";
  return "gray";
}

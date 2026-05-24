import { Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriObjectRow } from "../../components/ui/MoriObjectRow";
import type { SourceRef, TimelineEvent } from "../../domain/types";
import { getSourceDisplayStatus } from "../../lib/sources/traceability";
import {
  describeConnectorSourceImportBadge,
  getConnectorSourceImportBadgeTone,
  type ConnectorSourceImportSummary,
} from "../../lib/connectors";
import { getSourceIcon } from "./sourceIcons";

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
  importSummary?: ConnectorSourceImportSummary;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const display = getSourceDisplayStatus(source);
  const SourceIcon = getSourceIcon(source.kind);
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
      <MoriObjectRow
        leading={
          <span className={`imported-source-icon tone-${display.trustTone}`}>
            <SourceIcon size={15} />
          </span>
        }
        title={source.title}
        subtitle={source.detail}
        meta={
          <>
            <Badge tone="purple">{display.integrationLabel}</Badge>
            <Badge tone={display.trustTone}>{display.trustLabel}</Badge>
            <Badge tone={display.rawDataTone}>{display.rawDataLabel}</Badge>
            {summaryBadge ? <Badge tone={summaryBadge.tone}>{summaryBadge.label}</Badge> : null}
            <span>
              {relatedEventCount} event{relatedEventCount === 1 ? "" : "s"}
            </span>
          </>
        }
        selected={selected}
        onClick={onSelect}
        ariaLabel={source.title}
      />
      {onRemove ? (
        <Button icon={Trash2} onClick={onRemove} aria-label="가져온 소스 제거" title="가져온 소스 제거" />
      ) : null}
    </article>
  );
}

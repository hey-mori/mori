import { ClipboardCopy, ExternalLink, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BaseObjectRow } from "../../components/ui/BaseObjectRow";
import { BaseMetadataLine } from "../../components/ui/BaseMetadataLine";
import {
  BaseContextMenu,
  BaseOverflowMenu,
  useContextMenuPosition,
  type BaseMenuItemSpec,
} from "../../components/ui/BaseActionMenu";
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
  const menu = useContextMenuPosition();
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
  const menuItems = buildSourceMenuItems({ source, onSelect, onRemove });

  return (
    <article
      className={`imported-source-row ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      <BaseObjectRow
        leading={
          <span className={`imported-source-icon tone-${display.trustTone}`}>
            <SourceIcon size={15} />
          </span>
        }
        title={source.title}
        subtitle={source.detail}
        meta={
          <BaseMetadataLine
            items={[
              summaryBadge ? (
                <Badge tone={summaryBadge.tone}>{summaryBadge.label}</Badge>
              ) : null,
              <span>관련 이벤트 {relatedEventCount}</span>,
            ]}
          />
        }
        selected={selected}
        onClick={onSelect}
        onActionMenu={menu.openAt}
        ariaLabel={source.title}
      />
      <BaseOverflowMenu items={menuItems} label={`${source.title} 작업`} />
      {onRemove ? (
        <Button
          icon={Trash2}
          onClick={onRemove}
          aria-label="가져온 소스 제거"
          title="가져온 소스 제거"
          size="sm"
        />
      ) : null}
      <BaseContextMenu
        open={menu.open}
        position={menu.position}
        items={menuItems}
        onClose={menu.close}
        label={`${source.title} 작업`}
      />
    </article>
  );
}

function buildSourceMenuItems({
  source,
  onSelect,
  onRemove,
}: {
  source: SourceRef;
  onSelect: () => void;
  onRemove?: () => void;
}): BaseMenuItemSpec[] {
  const items: BaseMenuItemSpec[] = [
    { id: "open", label: "소스 상세 열기", icon: ExternalLink, onSelect },
    { type: "separator", id: "copy-separator" },
    {
      id: "copy-title",
      label: "제목 복사",
      icon: ClipboardCopy,
      onSelect: () => copyText(source.title),
    },
    {
      id: "copy-detail",
      label: source.uri ? "경로/URL 복사" : "상세 복사",
      icon: ClipboardCopy,
      onSelect: () => copyText(source.uri ?? source.detail),
    },
    {
      id: "copy-id",
      label: "소스 ID 복사",
      icon: ClipboardCopy,
      onSelect: () => copyText(source.id),
    },
  ];
  if (onRemove) {
    items.push(
      { type: "separator", id: "remove-separator" },
      {
        id: "remove",
        label: "가져온 소스 제거",
        icon: Trash2,
        destructive: true,
        onSelect: onRemove,
      },
    );
  }
  return items;
}

function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      void navigator.clipboard.writeText(text).catch(() => {});
    } catch {
      // Clipboard access is permission-gated in some browser shells.
    }
  }
}

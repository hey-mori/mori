/**
 * UI primitives.
 *
 * The original primitives (`Badge`, `Button`, `EmptyState`, `MetricCard`,
 * `Panel`, `SectionHeader`, `Toggle`) remain for compatibility. The newer
 * `Base*` primitives are theme-token-driven and registry-aware, prefer
 * them in new code.
 */
export { Badge } from "./Badge";
export { Button } from "./Button";
export { EmptyState } from "./EmptyState";
export { MetricCard } from "./MetricCard";
export { Panel } from "./Panel";
export { SectionHeader } from "./SectionHeader";
export { Toggle } from "./Toggle";
export { BaseCard, type BaseCardProps, type BaseCardVariant } from "./BaseCard";
export { BaseDrawer, type BaseDrawerProps } from "./BaseDrawer";
export {
  BaseStatusBadge,
  type BaseStatusBadgeProps,
  type BaseStatusBadgeTone,
} from "./BaseStatusBadge";
export { BaseTrustBadge, type BaseTrustBadgeProps } from "./BaseTrustBadge";
export { BasePlannedAction, type BasePlannedActionProps } from "./BasePlannedAction";
export { BaseScrollArea, type BaseScrollAreaProps } from "./BaseScrollArea";
export {
  BaseFeatureStatusBadge,
  type BaseFeatureStatusBadgeProps,
} from "./BaseFeatureStatusBadge";
export { BaseStatCard, type BaseStatCardProps, type BaseStatCardTone } from "./BaseStatCard";
export {
  BaseToolbar,
  BaseToolbarSpacer,
  type BaseToolbarProps,
} from "./BaseToolbar";
export { BaseEmptyState, type BaseEmptyStateProps } from "./BaseEmptyState";
export { BaseSection, type BaseSectionProps } from "./BaseSection";
export { BaseListRow, type BaseListRowProps } from "./BaseListRow";
export { BaseObjectRow, type BaseObjectRowProps, type BaseObjectRowDensity } from "./BaseObjectRow";
export {
  BaseContextMenu,
  BaseOverflowMenu,
  useContextMenuPosition,
  type BaseMenuItemSpec,
  type BaseMenuPosition,
} from "./BaseActionMenu";
export { BaseMetadataLine, type BaseMetadataLineProps } from "./BaseMetadataLine";
export { BaseActionCluster, type BaseActionClusterProps } from "./BaseActionCluster";
export {
  BaseTooltip,
  BaseTooltipProvider,
  baseTooltipProps,
  type BaseTooltipKind,
} from "./BaseTooltip";
export { SearchField, type SearchFieldProps } from "./SearchField";
export { ToolbarSearch, type ToolbarSearchProps } from "./ToolbarSearch";
export { BaseSectionHeader, type BaseSectionHeaderProps } from "./BaseSectionHeader";
export {
  BaseInspectorPanel,
  type BaseInspectorPanelProps,
  InspectorSection,
  InspectorCard,
  InspectorFields,
  InspectorRows,
  InspectorRow,
  InspectorDisclosure,
  InspectorActions,
  InspectorNote,
  InspectorEmpty,
} from "./BaseInspectorPanel";
export { BaseMetricStrip, type BaseMetricStripProps, type BaseMetricItem } from "./BaseMetricStrip";
export {
  BaseSelect,
  type BaseSelectOption,
  type BaseSelectProps,
} from "./BaseSelect";
export {
  BaseChecklistSelect,
  type BaseChecklistOption,
  type BaseChecklistSelectProps,
} from "./BaseChecklistSelect";

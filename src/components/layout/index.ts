/**
 * Shared page layout primitives.
 *
 * These give every screen the same skeleton: a fixed page shell with a
 * pinned header / action bar and a single scroll boundary, plus consistent
 * inspector, empty-state, banner, and copy-diet disclosure patterns. New
 * surfaces should compose these instead of hand-rolling per-feature
 * containers, paddings, and scroll regions.
 */
export { AppShell } from "./AppShell";
export { PageShell, type PageShellProps } from "./PageShell";
export { PageHeader, type PageHeaderProps } from "./PageHeader";
export { ActionBar, type ActionBarProps } from "./ActionBar";
export { InspectorPanel, type InspectorPanelProps } from "./InspectorPanel";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { NoticeBanner, type NoticeBannerProps } from "./NoticeBanner";
export { HelpDisclosure, type HelpDisclosureProps } from "./HelpDisclosure";

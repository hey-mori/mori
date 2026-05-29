import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookMarked,
  ClipboardCheck,
  Compass,
  Database,
  Eye,
  FileText,
  FolderKanban,
  GanttChartSquare,
  GitBranch,
  HardDrive,
  House,
  Layers,
  Lightbulb,
  Link2,
  Lock,
  LayoutDashboard,
  Network,
  Package,
  Play,
  ScrollText,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Waypoints,
} from "lucide-react";
import type { TrustLevel } from "../../domain/types";
import type { ViewKey } from "../../domain/types";

/**
 * Mori icon vocabulary — the single source of truth for product iconography.
 *
 * Icons are chosen for *meaning*, not decoration: each one should help the
 * user recognise a surface or a piece of state at a glance. Surfaces should
 * import from here instead of reaching into `lucide-react` directly, so the
 * vocabulary stays consistent and a future swap happens in one place.
 */

/** Icon for each navigable product surface. */
export const viewIcon = {
  home: House, // the work-memory landing surface
  start: Play, // begin a work session
  timeline: GanttChartSquare, // chronological session events
  flow: Waypoints, // flow focus / trace path between events
  evidence: FileText, // source documents behind a memory
  review: ClipboardCheck, // review-before-apply gate
  reports: ScrollText, // resume narrative / report
  memory: Layers, // accumulated, structured project memory
  consolidation: BookMarked, // consolidation review of memory proposals
  companion: Compass, // companion guidance
  connections: Link2, // source catalogue / acquisition workspace
  dashboard: LayoutDashboard, // project-axis status and comparison
  workbench: GanttChartSquare, // multi-session review surface
  graph: Network, // experimental work-graph overview
  workspace: FolderKanban, // projects
  settings: Settings,
} satisfies Partial<Record<ViewKey, LucideIcon>>;

/** Icon for each trust level (verified / observed / inferred). */
export const trustIcon: Record<TrustLevel, LucideIcon> = {
  verified: ShieldCheck, // confirmed against a source
  observed: Eye, // captured directly from work
  inferred: Lightbulb, // Mori's own reasoning
};

/**
 * Icons for recurring Mori concepts referenced across surfaces — storage
 * boundaries, work-item kinds, and trust/privacy.
 */
export const conceptIcon = {
  localStorage: HardDrive,
  desktopSqlite: Database,
  moriPackage: Package,
  privacy: Lock,
  trust: ShieldCheck,
  issue: TriangleAlert,
  decision: GitBranch,
  nextAction: ArrowRight,
} satisfies Record<string, LucideIcon>;

/**
 * Reads the intake buffer and hands 프로젝트 the projection for the project on
 * screen, or null when there is nothing honest to show.
 *
 * Deliberately not a subscription. The buffer is written by the 세션 view's poll
 * loop, which only runs while that view is mounted, so a live-updating stream
 * here would imply Mori is watching when it is not. This reads once per project
 * selection and lets the projection's own freshness (D11) say how current the
 * answer is. That is also why nothing here polls: the honest claim is "here is
 * what was observed, and when", not "here is what is happening".
 */
import { useEffect, useState } from "react";
import {
  buildProjectProjections,
  IntakeBrowserStore,
  selectProjectionForLabel,
  type ProjectProjection,
} from "../../lib/live-intake";

export function useProjectLive(label: string | null): ProjectProjection | null {
  const [projection, setProjection] = useState<ProjectProjection | null>(null);

  useEffect(() => {
    if (!label || typeof window === "undefined") {
      setProjection(null);
      return;
    }
    try {
      const rows = new IntakeBrowserStore().listAllRows();
      const projections = buildProjectProjections(rows, { now: Date.now() });
      setProjection(selectProjectionForLabel(projections, label));
    } catch (error) {
      // Same contract as the writer: intake must never break a surface. A
      // project page without its live section is a smaller loss than a project
      // page that does not render.
      console.error("[live-intake] failed to read observed rows", error);
      setProjection(null);
    }
  }, [label]);

  return projection;
}

/**
 * Feature-local re-export of the Timeline view-model helpers.
 *
 * The pure logic itself lives under `src/lib/timeline/` so unit tests can
 * import it without depending on React. Feature code should import from
 * THIS module so the boundary between feature and shared lib stays explicit.
 */
export {
  buildTimelineRenderModel,
  buildInspectorViewModel,
  filterEvents,
  getActiveLanes,
  getFocusedRelationships,
  countHiddenRelationships,
  type BuildTimelineRenderModelInput,
  type TimelineRenderModel,
  type LaneRenderModel,
  type InspectorViewModel,
  type TimelineMode,
  type TimelineEmptyVariant,
} from "../../../lib/timeline/timelineViewModel";

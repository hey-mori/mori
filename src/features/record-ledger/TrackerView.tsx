/**
 * 트래커 · the ledger rolled up by type and entity (architecture doc §8).
 * Instead of a flat list, a repeated activity reads as a total: 운동 5회 ·
 * 58분, broken down by entity (러닝 3회 · 45분). Reuses the entity work so a
 * rename reflects in the totals, and stays honest: a schema's total can
 * exceed the sum of its entity rows.
 */
import { useMemo } from "react";
import { LineChart, Repeat } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { useRecordLedger } from "./useRecordLedger";
import { aggregateTrackers, type TrackerGroup } from "./trackerAggregation";
import { discoverRoutines, routineEntityIds } from "./routineDiscovery";
import { ledgerVisibleRecords } from "./recordPresentation";

function metricText(group: TrackerGroup): string | null {
  if (!group.hasMetric || group.totalMetric <= 0) return null;
  return `${group.totalMetric}${group.metricUnit ?? ""}`;
}

export function TrackerView() {
  const { records, registry, entities, relations, contexts, loading, createRoutine } =
    useRecordLedger();

  const visible = useMemo(() => ledgerVisibleRecords(records), [records]);
  const groups = useMemo(
    () => aggregateTrackers(visible, relations, entities, registry),
    [visible, relations, entities, registry],
  );
  const suggestionByEntity = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const suggestion of discoverRoutines(visible, relations, entities, contexts)) {
      map.set(suggestion.entity.id, suggestion.recordIds);
    }
    return map;
  }, [visible, relations, entities, contexts]);
  const routineIds = useMemo(
    () => routineEntityIds(visible, relations, contexts),
    [visible, relations, contexts],
  );

  return (
    <PageShell maxWidth="full" actionBar={<ActionBar label="트래커" />}>
      <div className="tracker">
        {loading ? null : groups.length === 0 ? (
          <EmptyState
            icon={LineChart}
            title="아직 모을 기록이 없습니다"
            description="오늘 화면에서 운동·학습 같은 기록을 남기면, 유형과 항목별로 합계가 여기에 쌓입니다."
          />
        ) : (
          <ul className="tracker-list">
            {groups.map((group) => {
              const total = metricText(group);
              return (
                <li key={group.schemaId} className="tracker-group">
                  <div className="tracker-group-head">
                    <span className="tracker-group-name">{group.name}</span>
                    <span className="tracker-group-stat">
                      {group.recordCount}회{total ? ` · ${total}` : ""}
                    </span>
                  </div>
                  {group.entities.length > 0 ? (
                    <ul className="tracker-entities">
                      {group.entities.map((row) => {
                        const suggestion = suggestionByEntity.get(row.entity.id);
                        const isRoutine = routineIds.has(row.entity.id);
                        return (
                          <li key={row.entity.id} className="tracker-entity">
                            <span className="tracker-entity-name">
                              {row.entity.canonicalName}
                              {isRoutine ? (
                                <span className="tracker-routine-badge">
                                  <Repeat size={11} aria-hidden="true" />
                                  루틴
                                </span>
                              ) : null}
                            </span>
                            <span className="tracker-entity-trailing">
                              {suggestion && !isRoutine ? (
                                <button
                                  type="button"
                                  className="tracker-routine-save"
                                  onClick={() =>
                                    void createRoutine(row.entity.canonicalName, suggestion)
                                  }
                                >
                                  루틴으로 저장
                                </button>
                              ) : null}
                              <span className="tracker-entity-stat">
                                {row.count}회
                                {group.hasMetric && row.totalMetric > 0
                                  ? ` · ${row.totalMetric}${group.metricUnit ?? ""}`
                                  : ""}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}

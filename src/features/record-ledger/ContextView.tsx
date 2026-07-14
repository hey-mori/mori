/**
 * 프로젝트 · contexts over records (architecture doc §8, the reframe off the
 * AI-session-only model). A context (project, routine, topic, person) reads as
 * the records that belong to it: activities, decisions, agent sessions,
 * workouts, knowledge, whatever was captured or recorded into it.
 *
 * Left: the contexts that hold records, busiest first. Right: the selected
 * context's records, reusing the shared ledger row and inspector.
 */
import { useEffect, useMemo, useState } from "react";
import { FolderGit2, Repeat, Tag, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import type { KernelContext } from "../../lib/record-kernel/kernelTypes";
import { useRecordLedger } from "./useRecordLedger";
import { LedgerRow } from "./LedgerRow";
import { RecordInspector } from "./RecordInspector";
import { contextTypeLabel, groupRecordsByContext } from "./contextGrouping";
import { ledgerVisibleRecords } from "./recordPresentation";

const CONTEXT_ICON: Partial<Record<KernelContext["type"], LucideIcon>> = {
  project: FolderGit2,
  routine: Repeat,
  person: User,
};

export function ContextView() {
  const { records, registry, entities, relations, contexts, loading, renameEntity } =
    useRecordLedger();
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const groups = useMemo(
    () => groupRecordsByContext(contexts, ledgerVisibleRecords(records), relations),
    [contexts, records, relations],
  );

  // Default to the busiest context; keep a valid selection as data changes.
  useEffect(() => {
    if (groups.length === 0) {
      setSelectedContextId(null);
    } else if (!groups.some((group) => group.context.id === selectedContextId)) {
      setSelectedContextId(groups[0].context.id);
    }
  }, [groups, selectedContextId]);

  const activeGroup = groups.find((group) => group.context.id === selectedContextId) ?? null;
  const selectedRecord = activeGroup?.records.find((record) => record.id === selectedRecordId) ?? null;

  return (
    <PageShell maxWidth="full" actionBar={<ActionBar label="프로젝트" />}>
      {loading ? null : groups.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="아직 컨텍스트가 없습니다"
          description="세션을 활동으로 기록하거나 반복을 루틴으로 저장하면, 프로젝트·루틴별로 여기에 모입니다."
        />
      ) : (
        <div className={`context-page${selectedRecord ? " has-inspector" : ""}`}>
          <aside className="context-list" aria-label="컨텍스트 목록">
            {groups.map((group) => {
              const Icon = CONTEXT_ICON[group.context.type] ?? Tag;
              return (
                <button
                  key={group.context.id}
                  type="button"
                  className={`context-item${group.context.id === selectedContextId ? " is-active" : ""}`}
                  onClick={() => {
                    setSelectedContextId(group.context.id);
                    setSelectedRecordId(null);
                  }}
                >
                  <Icon size={13} aria-hidden="true" />
                  <span className="context-item-name">{group.context.name}</span>
                  <span className="context-item-type">{contextTypeLabel(group.context.type)}</span>
                  <span className="context-item-count">{group.records.length}</span>
                </button>
              );
            })}
          </aside>

          <div className="context-body">
            {activeGroup ? (
              <ul className="ledger-list">
                {activeGroup.records.map((record) => (
                  <LedgerRow
                    key={record.id}
                    record={record}
                    registry={registry}
                    selected={record.id === selectedRecordId}
                    onSelect={() =>
                      setSelectedRecordId((current) => (current === record.id ? null : record.id))
                    }
                  />
                ))}
              </ul>
            ) : null}
          </div>

          {selectedRecord ? (
            <RecordInspector
              record={selectedRecord}
              registry={registry}
              entities={entities}
              onRenameEntity={(entityId, newName) => void renameEntity(entityId, newName)}
              onClose={() => setSelectedRecordId(null)}
            />
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

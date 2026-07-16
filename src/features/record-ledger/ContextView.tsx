/**
 * 프로젝트 · a project reads as everything under it — its AI sessions AND its
 * kernel records (notes / decisions / activities). Sessions and records live in
 * two parallel stores; this view merges them by project so the page is filled
 * with the work the user actually has, not an empty kernel-only list.
 *
 * Left: the projects that hold work, busiest first. Right: the selected
 * project's sessions and records, in labeled sections.
 */
import { useEffect, useMemo, useState } from "react";
import { FolderGit2, Radio } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { useAppStore } from "../../app/store";
import { loadStoredSessionSummaries } from "../../app/sessionStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import { useSessionResolver } from "../session/useSessionResolver";
import { useRecordLedger } from "./useRecordLedger";
import { LedgerRow } from "./LedgerRow";
import { RecordInspector } from "./RecordInspector";
import { groupRecordsBySection } from "./contextGrouping";
import { buildProjectGroups } from "./projectGroups";
import { ledgerVisibleRecords } from "./recordPresentation";

export function ContextView() {
  const { records, registry, entities, relations, contexts, loading, renameEntity, updateRecord } =
    useRecordLedger();
  const navigate = useAppStore((state) => state.navigate);
  const openSession = useAppStore((state) => state.openSession);
  const resolveSession = useSessionResolver();
  const [summaries] = useState(() => safeSummaries());

  // Open the specific session the user clicked (materializing a discovered
  // session's transcript), not a generic jump to the 세션 workspace.
  const openSessionById = (sessionId: string) => {
    void resolveSession(sessionId).then((ok) => {
      if (ok) openSession("flow");
      else navigate("sessions");
    });
  };
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const groups = useMemo(
    () =>
      buildProjectGroups(
        mergeDemoSessionSummaries(summaries),
        contexts,
        ledgerVisibleRecords(records),
        relations,
      ),
    [summaries, contexts, records, relations],
  );

  // Default to the busiest project; keep a valid selection as data changes.
  useEffect(() => {
    if (groups.length === 0) {
      setSelectedProjectId(null);
    } else if (!groups.some((group) => group.id === selectedProjectId)) {
      setSelectedProjectId(groups[0].id);
    }
  }, [groups, selectedProjectId]);

  const activeGroup = groups.find((group) => group.id === selectedProjectId) ?? null;
  const selectedRecord = activeGroup?.records.find((record) => record.id === selectedRecordId) ?? null;
  const recordSections = useMemo(
    () => (activeGroup ? groupRecordsBySection(activeGroup.records) : []),
    [activeGroup],
  );

  return (
    <PageShell maxWidth="full" actionBar={<ActionBar label="프로젝트" />}>
      {loading ? null : groups.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="아직 프로젝트가 없습니다"
          description="AI 세션을 연동하거나 기록을 프로젝트에 담으면, 프로젝트별로 여기에 모입니다."
        />
      ) : (
        <div className={`context-page${selectedRecord ? " has-inspector" : ""}`}>
          <aside className="context-list" aria-label="프로젝트 목록">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`context-item${group.id === selectedProjectId ? " is-active" : ""}`}
                onClick={() => {
                  setSelectedProjectId(group.id);
                  setSelectedRecordId(null);
                }}
              >
                <FolderGit2 size={13} aria-hidden="true" />
                <span className="context-item-name">{group.name}</span>
                <span className="context-item-count">
                  {group.sessions.length + group.records.length}
                </span>
              </button>
            ))}
          </aside>

          <div className="context-body">
            {activeGroup ? (
              <>
                {activeGroup.sessions.length > 0 ? (
                  <section className="context-section">
                    <p className="context-section-label">
                      세션
                      <span className="context-section-count">{activeGroup.sessions.length}</span>
                    </p>
                    <ul className="context-session-list">
                      {activeGroup.sessions.map((session) => (
                        <li key={session.sessionId}>
                          <button
                            type="button"
                            className="context-session-row"
                            onClick={() => openSessionById(session.sessionId)}
                          >
                            <span className="context-session-icon" aria-hidden="true">
                              <Radio size={12} />
                            </span>
                            <span className="context-session-title">{session.title}</span>
                            <span className="context-session-time">
                              {formatClaudeRelativeKo(session.startedAt || session.savedAt)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {recordSections.map((section) => (
                  <section key={section.id} className="context-section">
                    <p className="context-section-label">
                      {section.label}
                      <span className="context-section-count">{section.records.length}</span>
                    </p>
                    <ul className="ledger-list">
                      {section.records.map((record) => (
                        <LedgerRow
                          key={record.id}
                          record={record}
                          registry={registry}
                          selected={record.id === selectedRecordId}
                          onSelect={() =>
                            setSelectedRecordId((current) =>
                              current === record.id ? null : record.id,
                            )
                          }
                        />
                      ))}
                    </ul>
                  </section>
                ))}

                {activeGroup.records.length === 0 ? (
                  <p className="context-empty-records">
                    이 프로젝트에는 아직 기록이 없습니다. 세션에서 정리하거나 기록을 담아보세요.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          {selectedRecord ? (
            <RecordInspector
              record={selectedRecord}
              registry={registry}
              entities={entities}
              onRenameEntity={(entityId, newName) => void renameEntity(entityId, newName)}
              onUpdate={(patch) => void updateRecord(selectedRecord, patch)}
              onClose={() => setSelectedRecordId(null)}
            />
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

function safeSummaries() {
  try {
    return loadStoredSessionSummaries();
  } catch {
    return [];
  }
}

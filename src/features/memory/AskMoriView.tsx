import { ActionBar } from "../../components/layout/ActionBar";
import { PageShell } from "../../components/layout/PageShell";
import { useAppStore } from "../../app/store";
import { AskMoriCard } from "./AskMoriCard";
import { useMemoryService } from "./useMemoryService";

/**
 * Ask Mori as a standalone surface, reached from the command palette so the
 * "ask your memory" capability lives outside the warehouse (see
 * `docs/design/memory-as-a-service.md`). It binds the memory-api facade via
 * `useMemoryService` and reuses the same `AskMoriCard` the Project Memory
 * page renders, so there is one capability and one card, two entry points.
 */
export function AskMoriView() {
  const { input, settings } = useMemoryService();
  const navigate = useAppStore((state) => state.navigate);
  const setSelectedEventId = useAppStore((state) => state.setSelectedEventId);

  return (
    <PageShell className="ask-mori-page" maxWidth="wide" actionBar={<ActionBar label="Mori에게 묻기" />}>
      <div className="ask-mori-standalone">
        <AskMoriCard
          input={input}
          settings={settings}
          onSelectMemory={() => navigate("memory")}
          onNavigateEvent={(eventId) => {
            setSelectedEventId(eventId);
            navigate("timeline");
          }}
        />
      </div>
    </PageShell>
  );
}

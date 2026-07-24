import { useEffect, useMemo } from "react";
import { ArrowUpRight, Network } from "lucide-react";
import { EmptyState } from "../../components/layout/EmptyState";
import { Button } from "../../components/ui/Button";
import { PageShell } from "../../components/layout/PageShell";
import { useAppStore } from "../../app/store";
import {
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import {
  mergeDemoSessionSummaries,
  isDemoSessionId,
} from "../../lib/demo/demoSessionFixtures";
import { buildDemoSessionContent } from "../../lib/demo/demoSessionContent";
import { buildSessionsBrowserModel } from "../../lib/workspace/sessionsBrowser";
import {
  buildWorkGraph,
  type WorkGraphItem,
  type WorkGraphProject,
} from "../../lib/graph/workGraph";
import { GraphCanvas } from "./GraphCanvas";

/** Items hung off each session node — a few decisions then open issues. */
const MAX_DECISIONS_PER_SESSION = 3;
const MAX_ISSUES_PER_SESSION = 2;

/**
 * Graph view (experimental) — a full-bleed, Obsidian-style map of the user's
 * work: a hub, project nodes, and the sessions linked to them, laid out by a
 * live force simulation. Reached from the sidebar quick-action and the command
 * palette. No chrome copy — the map speaks for itself.
 */
export function GraphView() {
  const openProject = useAppStore((state) => state.openProject);
  const openSession = useAppStore((state) => state.openSession);
  const navigate = useAppStore((state) => state.navigate);
  const loadBrowserSession = useSessionStore((state) => state.loadBrowserSession);
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const mode = useSessionStore(selectSessionMode);
  const view = useSessionStore(selectSessionView);
  const draft = useSessionStore((state) => state.draft);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const repository = useMemo(() => createBrowserDraftRepository(), []);

  const { graph, unsourcedKeys } = useMemo(() => {
    let stored: ReturnType<typeof repository.listStoredSessions>;
    try {
      stored = mergeDemoSessionSummaries(repository.listStoredSessions());
    } catch {
      stored = [];
    }
    const model = buildSessionsBrowserModel({
      active: {
        sessionId: view.session.id,
        title: view.session.title,
        status: view.session.status,
        sourceLabel: view.session.sourceLabel?.trim() || null,
        startedAt: view.session.startedAt || null,
        endedAt: view.session.endedAt || null,
        isDemo: mode === "demo",
        isStored: Boolean(draft),
      },
      storedSessions: stored,
      filters: { query: "", origin: "all", sort: "recent" },
    });

    const projects: WorkGraphProject[] = model.groups.map((group) => ({
      key: group.key,
      label: shortLabel(group.label),
      sessions: group.sessions.map((session) => ({
        sessionId: session.sessionId,
        title: session.title,
        items: gatherSessionItems(session.sessionId, repository),
      })),
    }));
    const unsourced = new Set(
      model.groups.filter((group) => group.isUnsourced).map((group) => group.key),
    );

    return { graph: buildWorkGraph(projects), unsourcedKeys: unsourced };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, mode, initialized, view, draft]);

  const hasWork = graph.nodes.some((node) => node.kind === "project");

  return (
    <PageShell className="graph-page" maxWidth="full">
      {!hasWork ? (
        <EmptyState
          icon={Network}
          title="그래프로 보여줄 작업이 없습니다"
          description="연동에서 작업을 가져오면 프로젝트와 세션이 이 지도에 나타납니다."
          actions={
            <Button variant="primary" icon={ArrowUpRight} onClick={() => navigate("connections")}>
              연동 열기
            </Button>
          }
        />
      ) : (
        <GraphCanvas
          nodes={graph.nodes}
          links={graph.links}
          onOpenProject={(key) => {
            if (!unsourcedKeys.has(key)) openProject(key);
          }}
          onOpenSession={(sessionId) => {
            loadBrowserSession(sessionId);
            openSession("flow");
          }}
        />
      )}
    </PageShell>
  );
}

/** Trailing path segment of a source label for a compact node label. */
function shortLabel(label: string): string {
  const parts = label.split(/[\\/]/).filter(Boolean);
  const tail = parts.length > 0 ? parts[parts.length - 1]! : label;
  return tail.length <= 18 ? tail : `${tail.slice(0, 17)}…`;
}

/**
 * The memory items that hang off a session node: a few decisions then a couple
 * of open issues. Reads the demo fixture for demo sessions and the stored
 * memory body otherwise; a session with no reviewed work contributes nothing.
 */
function gatherSessionItems(
  sessionId: string,
  repository: ReturnType<typeof createBrowserDraftRepository>,
): WorkGraphItem[] {
  let decisions: { id: string; title: string }[] = [];
  let issues: { id: string; title: string; status: string }[] = [];

  if (isDemoSessionId(sessionId)) {
    const demo = buildDemoSessionContent(sessionId);
    decisions = demo?.decisions ?? [];
    issues = demo?.issues ?? [];
  } else {
    try {
      const body = repository.loadSessionMemoryBody(sessionId);
      decisions = body?.decisions ?? [];
      issues = body?.issues ?? [];
    } catch {
      decisions = [];
      issues = [];
    }
  }

  const items: WorkGraphItem[] = [];
  for (const decision of decisions.slice(0, MAX_DECISIONS_PER_SESSION)) {
    items.push({ id: decision.id, kind: "decision", title: decision.title });
  }
  for (const issue of issues.filter((i) => i.status === "open").slice(0, MAX_ISSUES_PER_SESSION)) {
    items.push({ id: issue.id, kind: "issue", title: issue.title });
  }
  return items;
}

import { useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { InfoHint } from "../../components/ui/InfoHint";
import { Badge } from "../../components/ui/Badge";
import { isTauriRuntime } from "../../lib/desktop";
import {
  discoverLocalAiTools,
  getToolStatusLabel,
  getToolStatusTone,
  type DetectedTool,
} from "../../lib/claude/installations";
import {
  AUTO_IMPORT_SETTINGS_CHANGED_EVENT,
  loadAutoImportSettings,
} from "../../lib/agents/autoImportSettings";
import { SettingsSection } from "./SettingsPrimitives";

/**
 * 연결된 에이전트 — the connection surface, reframed off the one-by-one import
 * model. Once an agent is detected, its sessions are collected automatically
 * (see the auto-collect toggle above), so this shows *what is connected* and
 * how much it holds, not a per-session import list. Desktop-only: the browser
 * cannot read the agents' logs, so it says so plainly.
 */
export function AgentConnectionsCard() {
  const desktop = isTauriRuntime();
  const [tools, setTools] = useState<DetectedTool[] | null>(null);
  const [loading, setLoading] = useState(desktop);
  const [autoImportOn, setAutoImportOn] = useState(() => loadAutoImportSettings().enabled);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setAutoImportOn(loadAutoImportSettings().enabled);
    window.addEventListener(AUTO_IMPORT_SETTINGS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AUTO_IMPORT_SETTINGS_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    setLoading(true);
    discoverLocalAiTools()
      .then((report) => {
        if (!cancelled) setTools(report.tools);
      })
      .catch(() => {
        if (!cancelled) setTools([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  // Only tools that are actually present — hide not-found / unsupported.
  const present = (tools ?? []).filter(
    (tool) => tool.status !== "not-found" && tool.status !== "unsupported",
  );

  return (
    <SettingsSection
      title="연결된 에이전트"
      action={
        <InfoHint label="연결된 에이전트 안내">
          감지된 에이전트의 세션은 자동으로 수집됩니다. 하나씩 가져올 필요 없이,
          연결되어 있으면 새 세션과 이어진 작업이 계속 세션 목록에 쌓입니다.
        </InfoHint>
      }
    >
      {!desktop ? (
        <p className="agent-conn-note">
          데스크톱 앱에서 Claude · Codex · OpenCode 등을 자동으로 감지하고 수집합니다.
          브라우저에서는 에이전트 로그에 접근할 수 없습니다.
        </p>
      ) : loading ? (
        <p className="agent-conn-note">에이전트를 찾는 중…</p>
      ) : present.length === 0 ? (
        <p className="agent-conn-note">
          감지된 에이전트가 없습니다. Claude · Codex · OpenCode 등을 사용하면 여기에
          나타나고 자동으로 수집됩니다.
        </p>
      ) : (
        <ul className="agent-conn-grid">
          {present.map((tool) => (
            <li key={tool.id} className="agent-conn-card">
              <span className="agent-conn-icon" aria-hidden="true">
                <Plug size={15} />
              </span>
              <span className="agent-conn-body">
                <span className="agent-conn-name">{tool.label}</span>
                <span className="agent-conn-meta">
                  {tool.sessionCount != null ? `세션 ${tool.sessionCount.toLocaleString()}개` : "세션 없음"}
                  {autoImportOn && tool.canImport ? " · 자동 수집 중" : ""}
                </span>
              </span>
              <Badge tone={getToolStatusTone(tool.status)}>{getToolStatusLabel(tool.status)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

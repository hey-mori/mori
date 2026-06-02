/**
 * In-app connector setup guides.
 *
 * The docs-template capture surfaces (Claude Code hook, Codex / OpenCode CLI
 * wrappers, the local-capture bridge) ship a real pipeline but require the
 * user to install a small script before they emit connector JSONL. The
 * capture-surface matrix names "an in-app install guide" as the next step for
 * each — this module is that guide: ordered, copyable steps derived from the
 * shipped `connectors/` templates.
 *
 * Pure data + lookup, no React. Every command is explicit and local-only — no
 * step ever asks for an account, a token, or a background watcher.
 */
import type { CaptureSurfaceId } from "./captureSurfaces";

export type ConnectorSetupStep = {
  /** Imperative instruction shown as the step body. */
  text: string;
  /** Optional copyable shell command or path for the step. */
  command?: string;
};

export type ConnectorSetupGuide = {
  surfaceId: CaptureSurfaceId;
  /** The connector template directory shipped in the repo. */
  templateDir: string;
  /** Ordered setup steps, ending before the import (which is the row action). */
  steps: ConnectorSetupStep[];
  /** Closing note — how the captured JSONL re-enters Mori through review. */
  importNote: string;
};

const GUIDES: Partial<Record<CaptureSurfaceId, ConnectorSetupGuide>> = {
  claudeCodeHook: {
    surfaceId: "claudeCodeHook",
    templateDir: "connectors/claude-code/",
    steps: [
      {
        text: "Claude Code 설정 파일을 엽니다. 모든 프로젝트를 캡처하려면 전역 파일, 한 레포만 캡처하려면 그 레포의 .claude/settings.json을 씁니다.",
        command: "~/.claude/settings.json",
      },
      {
        text: "connectors/claude-code/mori-claude-hook.example.json의 hooks 블록을 합칩니다 (SessionStart · UserPromptSubmit · PostToolUse · SessionEnd). command 경로만 OS에 맞게 넣습니다.",
      },
      {
        text: "macOS / Linux: .sh 런처 절대경로를 command로 사용합니다.",
        command: "/ABSOLUTE/PATH/connectors/claude-code/mori-claude-hook.sh",
      },
      {
        text: "Windows: .ps1 실행정책 문제를 피하려고 python으로 .py를 직접 호출합니다.",
        command: 'python "C:\\PATH\\TO\\connectors\\claude-code\\mori-claude-hook.py"',
      },
      {
        text: "Claude Code를 평소처럼 사용하면 요약 이벤트가 Claude 세션별 JSONL로 쌓입니다 (동시 세션도 파일이 분리됩니다).",
        command: "~/.mori/connectors/claude-code/<날짜>-<세션id>.jsonl",
      },
    ],
    importNote: "쌓인 JSONL을 이 행의 'Connector JSONL 가져오기'로 가져오면 검토를 거쳐 타임라인에 들어갑니다. 프롬프트·툴 본문은 저장하지 않고 요약만 남습니다.",
  },
  codexCliWrapper: {
    surfaceId: "codexCliWrapper",
    templateDir: "connectors/codex-cli/",
    steps: [
      {
        text: "Codex 기록은 ~/.codex/sessions에서 자동 감지됩니다. 래퍼는 시작·종료·git diff 마커가 따로 필요할 때만 씁니다.",
      },
      {
        text: "macOS / Linux: .sh 래퍼로 Codex 실행을 감쌉니다 (요약·exit code·duration 기록).",
        command: 'connectors/codex-cli/mori-codex-wrapper.sh --git -- codex run "작업 설명"',
      },
      {
        text: "Windows: .ps1 래퍼를 PowerShell로 실행합니다.",
        command:
          'powershell -ExecutionPolicy Bypass -File connectors\\codex-cli\\mori-codex-wrapper.ps1 -Git -- codex run "작업 설명"',
      },
    ],
    importNote: "기록된 JSONL을 이 행의 'Connector JSONL 가져오기'로 가져옵니다. Codex 출력 본문은 수집하지 않습니다.",
  },
  openCodeCli: {
    surfaceId: "openCodeCli",
    templateDir: "connectors/opencode-cli/",
    steps: [
      {
        text: "OpenCode 기록은 데스크톱에서 자동 감지됩니다. 래퍼는 시작·종료·git diff 마커가 따로 필요할 때만 씁니다.",
      },
      {
        text: "macOS / Linux: .sh 래퍼로 OpenCode 실행을 감쌉니다 (요약·exit code·duration 기록).",
        command: 'connectors/opencode-cli/mori-opencode-wrapper.sh --git -- opencode run "작업 설명"',
      },
      {
        text: "Windows: .ps1 래퍼를 PowerShell로 실행합니다.",
        command:
          'powershell -ExecutionPolicy Bypass -File connectors\\opencode-cli\\mori-opencode-wrapper.ps1 -Git -- opencode run "작업 설명"',
      },
    ],
    importNote: "기록된 JSONL을 이 행의 'Connector JSONL 가져오기'로 가져옵니다. OpenCode 출력 본문은 수집하지 않습니다.",
  },
  localCaptureBridge: {
    surfaceId: "localCaptureBridge",
    templateDir: "connectors/local-capture/",
    steps: [
      {
        text: "Python 3.8+ 환경에서 캡처 스크립트를 직접 실행합니다 (--note / --transcript / --git-repo).",
        command: 'python3 connectors/local-capture/mori-local-capture.py --note "메모 내용"',
      },
      {
        text: "선택적으로 터미널 셸 함수나 VS Code 태스크 템플릿으로 같은 스크립트를 호출할 수 있습니다.",
      },
    ],
    importNote: "스크립트가 쓴 JSONL을 이 행의 'Connector JSONL 가져오기'로 가져옵니다. watcher나 데몬은 없습니다.",
  },
  mcpServer: {
    surfaceId: "mcpServer",
    templateDir: "connectors/mcp/",
    steps: [
      {
        text: "MCP SDK를 설치하고 서버 템플릿을 호스트 앱(Claude Desktop 등)에 등록합니다.",
        command: 'pip install "mcp[cli]"',
      },
      {
        text: "호스트에서 AI에게 capture 도구를 명시적으로 호출하도록 요청하면 ~/.mori/connectors/mcp/에 JSONL이 기록됩니다.",
      },
    ],
    importNote: "기록된 JSONL을 이 행의 'Connector JSONL 가져오기'로 가져옵니다. 호스트 앱 메모리나 네트워크는 읽지 않습니다.",
  },
};

/** The setup guide for a capture surface, or null when none is needed. */
export function getConnectorSetupGuide(surfaceId: CaptureSurfaceId): ConnectorSetupGuide | null {
  return GUIDES[surfaceId] ?? null;
}

/** Whether a capture surface ships an in-app setup guide. */
export function hasConnectorSetupGuide(surfaceId: CaptureSurfaceId): boolean {
  return surfaceId in GUIDES;
}

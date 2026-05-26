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
        text: "훅 스크립트를 실행 가능한 위치에 복사합니다.",
        command: "cp connectors/claude-code/mori-claude-hook.sh ~/.local/bin/",
      },
      {
        text: "Claude Code 설정의 hooks에 스크립트를 등록합니다 (connectors/claude-code/mori-claude-hook.example.json 참고).",
      },
      {
        text: "Claude Code를 평소처럼 사용하면 요약 이벤트가 로컬 JSONL로 쌓입니다.",
        command: "~/.mori/connectors/claude-code/",
      },
    ],
    importNote: "쌓인 JSONL을 이 행의 'Connector JSONL 가져오기'로 가져오면 검토를 거쳐 타임라인에 들어갑니다.",
  },
  codexCliWrapper: {
    surfaceId: "codexCliWrapper",
    templateDir: "connectors/codex-cli/",
    steps: [
      {
        text: "래퍼 스크립트를 PATH에 설치합니다.",
        command: "cp connectors/codex-cli/mori-codex-wrapper.sh ~/.local/bin/",
      },
      {
        text: "Codex 실행을 래퍼로 감싸면 prompt 요약·exit code·duration이 기록됩니다.",
        command: 'mori-codex-wrapper.sh --git -- codex run "작업 설명"',
      },
    ],
    importNote: "기록된 JSONL을 이 행의 'Connector JSONL 가져오기'로 가져옵니다. Codex 출력 본문은 수집하지 않습니다.",
  },
  openCodeCli: {
    surfaceId: "openCodeCli",
    templateDir: "connectors/opencode-cli/",
    steps: [
      {
        text: "래퍼 스크립트를 PATH에 설치합니다.",
        command: "cp connectors/opencode-cli/mori-opencode-wrapper.sh ~/.local/bin/",
      },
      {
        text: "OpenCode 실행을 래퍼로 감싸면 prompt 요약·exit code·duration이 기록됩니다.",
        command: 'mori-opencode-wrapper.sh --git -- opencode run "작업 설명"',
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
};

/** The setup guide for a capture surface, or null when none is needed. */
export function getConnectorSetupGuide(surfaceId: CaptureSurfaceId): ConnectorSetupGuide | null {
  return GUIDES[surfaceId] ?? null;
}

/** Whether a capture surface ships an in-app setup guide. */
export function hasConnectorSetupGuide(surfaceId: CaptureSurfaceId): boolean {
  return surfaceId in GUIDES;
}

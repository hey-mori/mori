import { describe, expect, it } from "vitest";
import {
  classifyCaptureSignal,
  isLowSignalText,
  lowSignalReasonLabel,
  type LowSignalReason,
} from "./captureSignal";

/** The low-signal reason for a text, or null when it is kept. Narrows the
 *  discriminated union so tests can assert on the reason directly. */
function reasonOf(text: string): LowSignalReason | null {
  const result = classifyCaptureSignal(text);
  return result.signal === "low" ? result.reason : null;
}

describe("classifyCaptureSignal · low-signal (drops to source only)", () => {
  it("flags a bare npm command", () => {
    expect(classifyCaptureSignal("npm run build")).toEqual({
      signal: "low",
      reason: "command",
    });
  });

  it("flags a git command with flags", () => {
    expect(isLowSignalText('git commit -m "fix"')).toBe(true);
  });

  it("flags a PowerShell prompt line", () => {
    expect(reasonOf("PS C:\\dev\\mori> npm test")).toBe("command");
  });

  it("flags a bash prompt line", () => {
    expect(reasonOf("$ ls -la")).toBe("command");
  });

  it("flags a windows path prompt even across several output lines", () => {
    const text = "C:\\dev\\mori> npm run build\n> mori@0.1.0 build\n> tsc && vite build\nbuilt in 9s";
    expect(classifyCaptureSignal(text)).toEqual({ signal: "low", reason: "command" });
  });

  it("flags cargo / docker / kubectl invocations", () => {
    expect(isLowSignalText("cargo check")).toBe(true);
    expect(isLowSignalText("docker compose up -d")).toBe(true);
    expect(isLowSignalText("kubectl get pods")).toBe(true);
  });

  it("flags an ambiguous dev tool with a known subcommand", () => {
    expect(reasonOf("cargo build")).toBe("command");
    expect(reasonOf("brew install ripgrep")).toBe("command");
    expect(reasonOf("yarn add react")).toBe("command");
    expect(reasonOf("pip install requests")).toBe("command");
  });

  it("flags a bash prompt only when the remainder is a real command", () => {
    expect(reasonOf("$ ls -la")).toBe("command");
    expect(reasonOf("# git status")).toBe("command");
  });

  it("flags agent tool-run noise", () => {
    expect(reasonOf("🔧 Read src/app/store.ts")).toBe("tool-noise");
    expect(reasonOf("↳ 도구 결과\n파일 42줄")).toBe("tool-noise");
  });

  it("flags a lone code block", () => {
    expect(reasonOf("```ts\nconst x = 1;\n```")).toBe("code");
  });

  it("flags a bare windows file path", () => {
    expect(reasonOf("C:\\dev\\mori\\src\\lib\\capture\\index.ts")).toBe("path");
  });

  it("flags a bare unix-style repo path", () => {
    expect(reasonOf("src/lib/capture/captureSignal.ts")).toBe("path");
  });

  it("flags empty / whitespace-only text as too short", () => {
    expect(reasonOf("   ")).toBe("too-short");
    expect(reasonOf("")).toBe("too-short");
  });

  it("flags an ambiguous command word only with a real command argument", () => {
    expect(reasonOf("make -j8")).toBe("command");
    expect(reasonOf("cat /etc/hosts")).toBe("command");
    expect(reasonOf("find . -name '*.ts'")).toBe("command");
    expect(reasonOf("cd C:\\dev\\mori")).toBe("command");
  });
});

describe("classifyCaptureSignal · keep (worth a record)", () => {
  it("keeps a Korean activity note", () => {
    expect(classifyCaptureSignal("오늘 러닝 30분 했다")).toEqual({ signal: "keep" });
  });

  it("keeps an insight / thought", () => {
    expect(isLowSignalText("캡처 품질 게이트는 원문 보존을 깨지 않아야 한다")).toBe(false);
  });

  it("keeps a URL (a meaningful pointer, kept as source-document)", () => {
    expect(classifyCaptureSignal("https://example.com/article")).toEqual({ signal: "keep" });
  });

  it("keeps a multi-paragraph note that merely opens with a command word", () => {
    const text =
      "make 를 다시 배웠다. 오늘 빌드 스크립트를 정리하면서\n" +
      "의존성 그래프를 이해했고, 다음엔 캐시를 붙여보기로 했다.";
    expect(classifyCaptureSignal(text)).toEqual({ signal: "keep" });
  });

  it("keeps prose that mixes Korean with an English term", () => {
    expect(isLowSignalText("git rebase 개념을 오늘 확실히 이해했다")).toBe(false);
  });

  it("keeps a short but meaningful single Korean word", () => {
    expect(isLowSignalText("회고")).toBe(false);
    expect(isLowSignalText("책")).toBe(false);
  });

  it("keeps English notes that open with an ambiguous command word", () => {
    expect(isLowSignalText("make a plan for the week")).toBe(false);
    expect(isLowSignalText("go running tomorrow morning")).toBe(false);
    expect(isLowSignalText("set goals for Q3")).toBe(false);
    expect(isLowSignalText("find a mentor")).toBe(false);
  });

  it("keeps short phrases with a lone separator (not a real path)", () => {
    expect(isLowSignalText("and/or")).toBe(false);
    expect(isLowSignalText("N/A")).toBe(false);
  });

  it("keeps Korean notes that open with #, >, or a postscript (not a shell prompt)", () => {
    expect(isLowSignalText("# 오늘의 회고\n마음이 복잡했던 하루였다")).toBe(false);
    expect(isLowSignalText("> 무엇이든 될 수 있다\n오늘 이 문장이 위로가 되었다")).toBe(false);
    expect(isLowSignalText("PS 우산 꼭 챙기기")).toBe(false);
  });

  it("keeps English notes that open with a dev-tool word used as prose", () => {
    // These matter especially in a Claude-work app where users write about Claude.
    expect(isLowSignalText("claude nailed the refactor today")).toBe(false);
    expect(isLowSignalText("brew tastes better with the new beans")).toBe(false);
    expect(isLowSignalText("poetry reading tonight was moving")).toBe(false);
    expect(isLowSignalText("cargo was delayed at the port")).toBe(false);
  });

  it("keeps a personal note that merely opens with a wrench emoji", () => {
    expect(isLowSignalText("🔧 오늘 수도꼭지 고쳤다")).toBe(false);
  });
});

describe("lowSignalReasonLabel", () => {
  it("maps every reason to plain Korean copy", () => {
    expect(lowSignalReasonLabel("command")).toContain("명령어");
    expect(lowSignalReasonLabel("tool-noise")).toContain("도구");
    expect(lowSignalReasonLabel("path")).toContain("경로");
    expect(lowSignalReasonLabel("code")).toContain("코드");
    expect(lowSignalReasonLabel("too-short")).toContain("짧");
  });
});

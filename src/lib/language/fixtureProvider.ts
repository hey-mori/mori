/**
 * Deterministic fixture provider · development and test ONLY.
 *
 * Exists so the full user flow (palette → composer → action → result → copy)
 * can be verified without installing an engine or entering an API key. It is
 * NOT a translation engine and its output is never evidence of translation
 * quality.
 *
 * Safety by construction:
 *  - `processingLocation: "fixture"`, so every surface labels it as a test
 *    fixture and it can never read as a local or cloud answer.
 *  - No network, no key, no settings.
 *  - `isFixtureProviderAvailable()` is false in a production build, so it can
 *    never be selected by default for a real user.
 *  - It returns PROSE in the real section-label format, so the genuine parser
 *    runs against it rather than being bypassed.
 */
import type { LanguageProvider } from "./languageProvider";

export const FIXTURE_PROVIDER_ID = "dev-fixture";

/** Canned replies keyed by the exact fixture inputs from the milestone spec. */
const UNDERSTAND_FIXTURE = [
  "번역: 핸들러를 수정하기 전에 요청 처리 흐름을 먼저 따라가 보겠습니다.",
  "의미: 코드를 바로 고치지 않고, 요청이 어디서 들어와 어떤 단계를 거치는지 먼저 파악하겠다는 뜻입니다. 원인을 모른 채 수정하지 않겠다는 신중한 태도를 드러냅니다.",
  "표현:",
  "- trace the request flow: 요청이 지나가는 경로를 처음부터 끝까지 따라가며 확인하다",
  "- handler: 특정 요청이나 이벤트를 실제로 처리하는 함수나 모듈",
  "뉘앙스: I'll은 지금 그렇게 하겠다는 가벼운 선언입니다. 허락을 구하기보다 진행 방향을 알리는 어조입니다.",
].join("\n");

const EXPRESS_FIXTURE = [
  "표현: Could you check the existing structure first, then make the changes?",
  "대안:",
  "- Please review the current structure before modifying it.: 정중하지만 분명한 업무 요청",
  "- Before changing anything, walk through the existing structure first.: 개발 에이전트에게 순서를 지시할 때",
  "- Do not modify anything until you have reviewed the existing structure.: 수정을 강하게 제한할 때",
  "차이: 첫 번째는 질문 형태라 가장 부드럽고, 두 번째는 순서를 지시하는 중립적인 업무 표현입니다. 세 번째는 조건을 강제하므로 에이전트가 임의로 코드를 고치는 것을 막고 싶을 때 씁니다.",
].join("\n");

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

const UNDERSTAND_INPUT = normalize("I'll trace the request flow before modifying the handler.");
const EXPRESS_INPUT = normalize("기존 구조를 먼저 확인하고 수정해줘.");

/**
 * Whether the fixture provider may be offered. False in production builds so a
 * real user can never be served canned text.
 */
export function isFixtureProviderAvailable(): boolean {
  return import.meta.env.DEV === true || import.meta.env.MODE === "test";
}

/** Pick the canned reply for a prompt, or an honest placeholder. */
export function fixtureReplyFor(userPrompt: string, action: "understand" | "express"): string {
  const haystack = normalize(userPrompt);
  // Curly and straight apostrophes both appear in real pastes.
  const understandMatch = haystack.includes(UNDERSTAND_INPUT.replace(/'/g, "'")) ||
    haystack.includes(UNDERSTAND_INPUT) ||
    haystack.includes(normalize("trace the request flow before modifying the handler"));
  if (action === "understand" && understandMatch) return UNDERSTAND_FIXTURE;
  if (action === "express" && haystack.includes(EXPRESS_INPUT)) return EXPRESS_FIXTURE;

  // Anything else: say plainly that this is a fixture with no canned answer,
  // rather than inventing a translation.
  return action === "express"
    ? "표현: (테스트 픽스처) 이 입력에 대한 준비된 예시가 없습니다.\n차이: 실제 표현을 보려면 분석 엔진을 연결하세요."
    : "의미: (테스트 픽스처) 이 입력에 대한 준비된 예시가 없습니다. 실제 해석을 보려면 분석 엔진을 연결하세요.";
}

/** Build the fixture provider. `delayMs` lets a test exercise the loading and
 *  cancellation paths deterministically. */
export function createFixtureProvider(delayMs = 0): LanguageProvider {
  return {
    info: {
      providerId: FIXTURE_PROVIDER_ID,
      providerDisplayName: "테스트 픽스처",
      processingLocation: "fixture",
      supportedActions: ["understand", "express"],
    },
    execute: ({ userPrompt, systemPrompt, signal }) =>
      new Promise<string>((resolve, reject) => {
        // The action is recoverable from the system prompt's own wording, so the
        // fixture needs no extra channel.
        const action = systemPrompt.includes("표현하기") ? "express" : "understand";
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        const timer = setTimeout(() => resolve(fixtureReplyFor(userPrompt, action)), delayMs);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  };
}

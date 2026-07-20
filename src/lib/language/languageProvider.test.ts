import { describe, expect, it } from "vitest";
import {
  classifyProviderError,
  LanguageProviderError,
  processingLocationLabel,
} from "./languageProvider";
import { createFixtureProvider, fixtureReplyFor, FIXTURE_PROVIDER_ID } from "./fixtureProvider";
import { parseLanguageResponse } from "./languageAction";
import {
  createConsentGrant,
  evaluateConsent,
  revokeProvider,
  type ProviderConsentGrant,
} from "./languageConsent";

describe("provider error classification", () => {
  it("maps transport failures to actionable kinds", () => {
    expect(classifyProviderError(new Error("fetch failed")).kind).toBe("unreachable");
    expect(classifyProviderError(new Error("request timed out")).kind).toBe("timeout");
    expect(classifyProviderError(new Error("The operation was aborted")).kind).toBe("cancelled");
    expect(classifyProviderError(new Error("weird")).kind).toBe("unknown");
  });

  it("passes an already-classified error through unchanged", () => {
    const error = new LanguageProviderError("no-engine", "없음");
    expect(classifyProviderError(error)).toBe(error);
  });
});

describe("processing location is never guessed", () => {
  it("labels each location distinctly, including unknown", () => {
    expect(processingLocationLabel("local")).toContain("이 기기");
    expect(processingLocationLabel("cloud")).toContain("외부");
    expect(processingLocationLabel("fixture")).toContain("픽스처");
    // An undeclared provider is not optimistically called local.
    expect(processingLocationLabel("unknown")).toContain("불명");
  });
});

describe("fixture provider", () => {
  it("declares itself a fixture so it cannot pass as a real engine", () => {
    const provider = createFixtureProvider();
    expect(provider.info.providerId).toBe(FIXTURE_PROVIDER_ID);
    expect(provider.info.processingLocation).toBe("fixture");
  });

  it("returns understand prose the real parser can read", async () => {
    const provider = createFixtureProvider();
    const reply = await provider.execute({
      systemPrompt: "당신은 Mori의 이해하기 도우미입니다.",
      userPrompt: "선택된 텍스트:\nI'll trace the request flow before modifying the handler.",
    });
    const parsed = parseLanguageResponse(reply, "understand");
    const keys = parsed.sections.map((s) => s.key);
    expect(keys).toContain("translation");
    expect(keys).toContain("meaning");
    expect(keys).toContain("expressions");
    expect(reply).toContain("trace the request flow");
    expect(reply).toContain("handler");
  });

  it("returns express prose with alternatives and their difference", async () => {
    const provider = createFixtureProvider();
    const reply = await provider.execute({
      systemPrompt: "당신은 Mori의 표현하기 도우미입니다.",
      userPrompt: "사용자가 하려는 말:\n기존 구조를 먼저 확인하고 수정해줘.",
    });
    const parsed = parseLanguageResponse(reply, "express");
    const keys = parsed.sections.map((s) => s.key);
    expect(keys).toContain("expressions");
    expect(keys).toContain("alternatives");
    expect(keys).toContain("difference");
  });

  it("admits when it has no canned answer instead of inventing one", () => {
    const reply = fixtureReplyFor("전혀 다른 문장입니다", "understand");
    expect(reply).toContain("픽스처");
    expect(reply).toContain("준비된 예시가 없습니다");
  });

  it("rejects when aborted, so a superseded request never lands", async () => {
    const provider = createFixtureProvider(50);
    const controller = new AbortController();
    const pending = provider.execute({
      systemPrompt: "이해하기",
      userPrompt: "x",
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe("consent policy", () => {
  const grant = (over: Partial<ProviderConsentGrant> = {}): ProviderConsentGrant =>
    createConsentGrant({
      providerId: "openai-compatible",
      scope: "provider",
      now: "2026-07-16T00:00:00.000Z",
      durable: true,
      ...over,
    });

  it("never asks consent for local or fixture processing", () => {
    expect(
      evaluateConsent({ providerId: "ollama", processingLocation: "local" }, []),
    ).toEqual({ outcome: "allowed", reason: "local" });
    expect(
      evaluateConsent({ providerId: "dev-fixture", processingLocation: "fixture" }, []),
    ).toEqual({ outcome: "allowed", reason: "fixture" });
  });

  it("blocks secure input even when a grant exists", () => {
    const decision = evaluateConsent(
      {
        providerId: "openai-compatible",
        processingLocation: "cloud",
        isSecureInput: true,
      },
      [grant()],
    );
    expect(decision).toEqual({ outcome: "blocked", reason: "secure-input" });
  });

  it("blocks a blocked app even when a grant exists", () => {
    const decision = evaluateConsent(
      {
        providerId: "openai-compatible",
        processingLocation: "cloud",
        isBlockedApp: true,
      },
      [grant()],
    );
    expect(decision).toEqual({ outcome: "blocked", reason: "blocked-app" });
  });

  it("asks for an unknown processing location rather than assuming safety", () => {
    expect(
      evaluateConsent({ providerId: "mystery", processingLocation: "unknown" }, []),
    ).toEqual({ outcome: "ask" });
  });

  it("does not transfer consent between providers", () => {
    const decision = evaluateConsent(
      { providerId: "another-cloud", processingLocation: "cloud" },
      [grant()],
    );
    expect(decision).toEqual({ outcome: "ask" });
  });

  it("honours an application-scoped grant only for that application", () => {
    const scoped = grant({ scope: "application", applicationId: "Code.exe" });
    expect(
      evaluateConsent(
        { providerId: "openai-compatible", processingLocation: "cloud", applicationId: "Code.exe" },
        [scoped],
      ).outcome,
    ).toBe("allowed");
    expect(
      evaluateConsent(
        { providerId: "openai-compatible", processingLocation: "cloud", applicationId: "chrome.exe" },
        [scoped],
      ).outcome,
    ).toBe("ask");
  });

  it("records a non-durable grant when persistence failed", () => {
    const memoryOnly = grant({ durable: false });
    expect(memoryOnly.durable).toBe(false);
  });

  it("revokes every grant for a provider", () => {
    expect(revokeProvider([grant()], "openai-compatible")).toHaveLength(0);
  });

  it("never stores captured text in a grant", () => {
    expect(Object.keys(grant())).not.toContain("text");
    expect(JSON.stringify(grant())).not.toMatch(/기존 구조/);
  });
});

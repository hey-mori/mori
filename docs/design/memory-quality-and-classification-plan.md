# Memory quality and classification plan

Diagnosis and plan from inspecting a real connected Claude Code session
(`ng-gw`, 319 turns) against the code. The memory looked weak because the
worst-case path was active, not because the model is wrong. Most fixes sit
in three files.

## What is actually wrong

**P1 · The local LLM Quick Pass silently fell back to the heuristic.** The
run used Ollama (`gemma4:e4b`) but the result was labelled "규칙 기반 ·
휴리스틱", i.e. the LLM failed and `fallbackToDeterministic` kicked in. The
fallback is labelled honestly but not prominently, so the user reads the
worst output and concludes memory is bad. (Model name `gemma4:e4b` is also
suspect; Ollama tags read like `gemma3:4b`.)

**P2 · The deterministic Quick Pass manufactures noise**
(`src/lib/analysis/deterministicQuickPassProvider.ts`).
- `ISSUE_PATTERNS` match any sentence containing `warning|error|fail`, so
  tool-output lines ("↳ 도구 결과: warning…", "GEMINI_API_ERROR…") become
  high-priority *issues*.
- `DECISION_PATTERNS` match `Decides|choose`, so a code comment
  ("* Decides which AI provider…") becomes a *decision*.
- Every unresolved issue spawns a "확인 또는 해결: …" next action,
  amplifying the noise.

**P3 · Timeline lanes are mis-routed**
(`src/lib/claude/claudeImport.ts` + `src/lib/timeline/activityModel.ts`).
- `claudeImport` stamps every event `type: "aiConversation"` and sets
  `actor: "tool"` for tool turns, parsing `toolName` (Edit / Write /
  WebFetch / …) but never using it for classification.
- `activityModel.deriveActivityKind` maps `actor === "tool"` → always
  `command`, so Edit/Write (file changes), WebFetch (research), and test
  runs all land in 명령 (159) while 코드·파일 and 리서치 stay empty (0).
- The fuzzy text heuristics (`looksLikeMemory` etc.) run *before* the actor
  checks, so a session that discusses "memory" (Mori itself) dumps ~20 tool
  events into the 메모리 lane.

**P4 · The import review is heavy.** 319 raw events to accept feels like
"confirm-confirm". The meaningful gate is durable-memory consolidation, not
the raw timeline.

**P5 · The connect moment leads with work, not insight.** Connecting a
conversation opens "review 319 events" instead of a compact digest of what
the conversation was and what would enter memory.

**P6 · The memory page is dense** (hero 6-stat strip, consolidation card,
warnings). Partly addressed (self-explaining intro, folded sessions).

## What is already good

The pipeline runs end to end; the lane taxonomy in `activityModel` is well
designed; fallback is labelled honestly; capabilities are pure and tested.
The problem is classification and the LLM path, not the architecture.

## Plan (prioritised)

1. **P3 · tool-aware lane classification.** Route tool events by `toolName`
   (Edit/Write → files, WebFetch/WebSearch → research, test Bash → build,
   else command) and run structural (actor/tool) classification *before*
   the fuzzy text heuristics. Pure, fully testable. *Biggest visible win on
   data the user already has.*
2. **P2 · extraction noise filter.** Skip tool events for issue/decision
   extraction and drop tool-output / error-envelope sentences. Cleaner
   memory, fewer junk next actions. Pure, testable.
3. **P1 · make the LLM path trustworthy.** More tolerant JSON parsing, and
   surface "fell back from a failed LLM" prominently (distinct from "you
   chose the rule-based engine") so the user knows to fix the engine. Verify
   the Ollama model/JSON path. (Engine config is the user's machine; code
   makes failure legible and parsing robust.)
4. **P5 · connect digest.** Run Quick Pass at connect time and show a
   compact "this conversation = N decisions · M issues · what enters memory"
   digest; fold the raw event list.
5. **P4 · auto-absorb imports, gate only durable memory.** *Decision: yes.*
   Import (timeline) events auto-accept on a user-connected source (low
   stakes, reversible); review-before-apply stays on durable consolidation
   only. This resolves the automation-vs-review tension: connect = auto,
   memory = reviewed.
6. **P6 · keep calming the memory page** (hero density, consolidation as a
   quiet task, warnings tone-down).

## Principles preserved

Evidence stays source of truth; durable memory still requires the
consolidation gate (P4 only relaxes the low-stakes import step on
explicitly-connected sources); local-first and honest-status hold (P1 makes
the LLM-failure state *more* honest, not less).

## Status (implemented)

All six items plus follow-ups are shipped:

- **P3** `activityModel` routes tool events by `toolName`; structural before fuzzy.
- **P2** `deterministicQuickPassProvider` skips tool events + filters noise sentences.
- **P1** review surface shows a failed-LLM fallback notice (`getQuickPassFallbackNotice`).
- **P5** `buildImportDigest` + the import-review digest strip.
- **P4** `createImportReviewDraft` auto-accepts `ai-transcript` events.
- **P6** memory page intro + folded sessions + hero trimmed to 3 stats.
- **LLM prompt** `promptTemplates` keeps tool events terse and tells the model
  tool output / code comments are not issues/decisions.
- **Ask Mori** honest `llmFailed` messaging + tool exclusion from references.
- **Root noise fix** `claudeImport` titles tool-result turns from the reply, not
  the dump; `queryableMemory.isToolEnvelopeText` skips tool-titled events for
  already-imported data.

Remaining (needs the user's machine / eyes): verify the local LLM produces
quality output once the Ollama model tag is corrected, then tune the prompt
against real output; optionally integrate Ask Mori into Home's question bar;
finish P6 (consolidation card / warnings tone-down) against a visual pass.

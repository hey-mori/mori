# Session creation + 자료 (evidence) UX overhaul

Captured from a dense round of real-use feedback on the new-session flow, the
import-review screen, and the 자료 tab. This is the durable backlog so nothing
is lost; items are grouped by how they ship.

## Shipped (this pass)

- **Project name = last folder**, not the full path
  (`C:\dev\tcc-ng-gw` → `tcc-ng-gw`). Once linked the name can differ.
  (`StartSessionView.lastFolderName`)
- **No forced new-project modal** on history-load. The suggested folder name
  prefills, but the user can pick an existing project or rename; the modal no
  longer pops automatically.
- **Copy diet**: removed the always-visible explanatory prose the user flagged
  — "반영하면 이 대화가 세션 타임라인이 됩니다…", "이렇게 들어갑니다",
  "세션은 하나의 AI 작업에서 만들어집니다 …", "가져온 근거만 표시됩니다 …",
  "자료 탭에서 대화를 가져오면 이슈·결정·다음 액션을 자동으로 정리합니다".
  Empty states keep one calm line.
- **Button label consistency**: "자료 추가" → "자료 가져오기".

## Shipped (Phase 1)

- **Import-review events as a compact list** (`ExtractedEventCard`): one row per
  event (time · title · status), click to expand the summary + actions.
- **No reset on method switch** (`StartSessionView.chooseMethod`): a loaded
  detected session, pasted transcript, and the filled title / project persist.
- **Unified empty states**: 흐름 / 자료 / 검토 share the `EmptyState` component
  with one calm line and a consistent 자료 가져오기 action (copy trimmed above).

## Shipped (Phase 2a + empty-state pattern)

- **Analysis panel above the source list** in the 자료 tab (no longer buried).
- **Report empty state unified** to `EmptyState`; the report builder no longer
  warns about zero sources.
- **"Show the layout, prompt above" empty states** (the user's "공유처럼"):
  - 검토: the 이슈 / 결정 / 다음 액션 columns always render (empty placeholders)
    under a banner that prompts to import or run analysis.
  - 흐름: the canonical lane rows render as an empty scaffold under a prompt
    banner, so the tab keeps its shape.
  - These replace the centered full-screen takeovers.

## Shipped (Phase 3: persistent import review)

- **Import review is persisted per session and absorbed into the 자료 tab**
  (Big IA item 7). The parsed import (rule-based timeline events) used to live
  only in an in-memory store and a full-screen takeover, so navigating away lost
  it with no way back, leaving an empty session. Now:
  - a new `StoredPendingReview` localStorage stream
    (`mori.sessionPendingReview.<sessionId>`) persists the review, keyed per
    session, schema-versioned, and cleared when its session is cleared.
  - the session store owns it (`pendingReview`), loading it on every session
    load and resetting it on every switch, so a review survives navigation and
    reload and never leaks across sessions.
  - the review renders as a section INSIDE the 자료 tab (not a takeover), via
    the `review-embedded` layout.
  - the in-memory `reviewStore` is retired; `beginPendingReview` /
    `applyPendingReview` / `cancelPendingReview` on the session store own the
    lifecycle. Apply turns accepted events into a `StoredSessionImport`.
  - this also resolves item 10's root cause (a freshly-imported session could
    land with 0 sources because the review was never applied / was reset).
  - Persistence is localStorage-only for v1 in both runtimes (no SQLite parity);
    applied imports keep their existing SQLite parity. A pending review is a
    pre-commit, local artifact, so cross-device pending state is out of scope.

## Next (UI, needs a visual pass)

1. **Session title = the session's own name** — BLOCKED on Rust. The Claude
   Code title is "the first user message, truncated" on the Tauri side
   (`ClaudeCodeSessionDetail.title`). The fix: in the Rust discovery, prefer the
   Claude-generated session summary entry when present, else the first message.
   No clean TS-only fix; do it in `src-tauri` with cargo verification.
2. **Project selection fully inline** (`StartSessionView`). The forced modal is
   gone; the remaining step is a picker that offers "use existing" and
   "create <folder>" in one place without any modal.
3. **Show "previously imported into this project"** linkage when a folder was
   already brought in.

## Big IA (design first)

7. ~~**Absorb import-review into the 자료 tab.**~~ SHIPPED (Phase 3 above): the
   review is persisted per session and hosted inline in the 자료 tab, so it
   survives navigation / reload and is always reachable.
8. **The 자료 tab must show what was imported**, not just a lone analysis card.
   PARTIAL: the review now shows the source card + extracted events inline. STILL
   TODO: bring the original-conversation preview (the detect-modal preview)
   inline, reading `pendingReview.draft.candidate` / `source`.
9. **Analysis screen, heavily upgraded** (continues the analysis-plan +
   transparency work): explain the engines plainly (규칙 기반 = local heuristic,
   no network; Ollama = local LLM; OpenAI 호환 = an OpenAI-style HTTP API,
   local or remote), show a real run log/stream, and make "what gets analyzed"
   and "how it was produced" legible.
10. ~~**Diagnose "분석 실행 안 됨".**~~ Root cause RESOLVED by item 7: a freshly
    imported session no longer lands with 0 sources from a lost / unapplied
    review. The review persists and applying it lands the sources.

## Principles

Copy-diet (move why/how into InfoHint or remove), compact + dense, one calm
honest signal per surface, retire-don't-delete, Korean-first. The 자료 tab
becomes the single home for "what this session is built from and how it was
understood".

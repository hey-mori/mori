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

7. **Absorb import-review into the 자료 tab.** The review screen should not be a
   separate, unreachable surface (after navigating away there is no way back).
   The 자료 tab is the home for: the imported sources/conversations, the
   original preview (like the detect modal), the import-review/accept step, and
   the analysis — all in one place, analysis prominent (not buried at the
   bottom).
8. **The 자료 tab must show what was imported**, not just a lone analysis card:
   which conversation/session, the source list, and the original (the modal
   preview, brought inline).
9. **Analysis screen, heavily upgraded** (continues the analysis-plan +
   transparency work): explain the engines plainly (규칙 기반 = local heuristic,
   no network; Ollama = local LLM; OpenAI 호환 = an OpenAI-style HTTP API,
   local or remote), show a real run log/stream, and make "what gets analyzed"
   and "how it was produced" legible. Today a fresh session shows 분석 대상:
   대화 0턴 because it has no sources — tie this to (7).
10. **Diagnose "분석 실행 안 됨".** A freshly created session can land with 0
    sources (import not applied / state reset), so analysis has nothing to run.
    Resolve via (4) and (7) so the imported work actually reaches the session.

## Principles

Copy-diet (move why/how into InfoHint or remove), compact + dense, one calm
honest signal per surface, retire-don't-delete, Korean-first. The 자료 tab
becomes the single home for "what this session is built from and how it was
understood".

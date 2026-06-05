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

## Next (UI, needs a visual pass)

1. **Session title = the session's own name**, not the user's first request.
   Fall back to the first request only when the session has no name. The title
   comes from the agent discovery (`workSessions` → `detail.title`), which today
   is the first message; the fix is in the discovery / a title-derivation step.
2. **Import-review events as a compact list**, not big cards. One line per event
   (time · title · lane), click to expand detail. Today each event is a tall
   card; 1140 of them do not scan.
3. **Project selection inline, not a modal** (`StartSessionView`). The picker
   should offer "use existing" and "create <folder>" in one place.
4. **Do not reset on method switch.** Switching 기록 ↔ 붙여넣기 ↔ 빈 세션 must
   keep the loaded title / project / selection instead of clearing them.
5. **Unified empty states** across 흐름 / 자료 / 검토 — one shared "아직 없음"
   pattern and one consistent primary action.
6. **Show "previously imported into this project"** linkage when a folder was
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

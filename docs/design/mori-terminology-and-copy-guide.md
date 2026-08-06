# Mori Terminology & UI Copy Guide

The authoritative vocabulary for Mori's user-facing copy. The goal is one calm,
precise, professional voice across every surface so the product reads as a
serious local-first work tool · never casual, never marketing, never "AI magic".

Read alongside:
- [`mori-brand-identity-reference.md`](mori-brand-identity-reference.md) · the
  brand voice and the colour/semantics contract.
- The shared label module
  [`src/lib/product-state/productStateLabels.ts`](../../src/lib/product-state/productStateLabels.ts)
  · the runtime source of truth for status labels. **This guide and that module
  must agree.** When they conflict, fix one of them in the same change.

When a label is rendered in more than one place, derive it from a shared helper
(`product-state`, `evidence/trust`, session-origin helpers) rather than copying
the string · drift between hand-rolled copies is the main thing this guide
exists to prevent.

---

## 1. Core concepts

| Concept | Korean | Note |
|---|---|---|
| Source | 소스 | The raw input (a Claude/Codex session, a git diff, a note). |
| Import | 가져오기 | Bringing external source data into Mori. See §7. |
| Capture | 수집 | Explicit, user-triggered recording of work. Never background. |
| Session | 세션 | One unit of captured/imported work. See §2. |
| Work context | 현재 작업 컨텍스트 | The session the user is working in now. |
| Evidence | 근거 | The source-backed basis for an item. See §3. |
| Provenance | 출처 / 출처 정보 | How a piece of data reached Mori. |
| Timeline | 타임라인 | The reconstructed flow of a session. See §5. |
| Review | 검토 | Inspecting items before they become durable. |
| Project memory | 프로젝트 기억 | Durable, reviewed, accepted memory. See §4. |
| Report | 보고서 | A generated summary of a session. |
| Resume prompt | 재개 프롬프트 | Copyable context to continue work later. |
| Handoff | 인계 | Sharing a session's outputs with someone else. |
| Notification | 알림 | A calm cross-session feed item; derived from reviewed data, reviewable, never an autonomous action. See §5. |
| Export | 내보내기 | Writing data out (a `.mori` package, a report). |
| Local-first storage | 로컬 저장 / 로컬 전용 | Data stays on this device. |
| AI inference | 추론 | An AI-derived item; always reviewable, never authoritative. |

## 2. Preferred Korean terms (quick reference)

- 소스, 가져오기, 수집, 세션, 현재 작업 컨텍스트, 근거, 출처, 타임라인, 검토,
  프로젝트 기억, 보고서, 재개 프롬프트, 인계, 내보내기, 로컬 전용, 추론.

## 3. Preferred English / internal terms

Code identifiers, types, and developer-facing docs stay English: `source`,
`import`, `capture`, `session`, `evidence`, `provenance`, `trust`, `timeline`,
`review`, `accepted memory`, `report`, `resume`, `handoff`, `export`,
`client-safe`. Product status terms that are intentionally English in the UI:
`Available / Partial / Planned / Unavailable`, `SQLite`, `localStorage`,
`Client-safe`, `.mori`, `Quick Pass`, `Flow Focus`.

## 4. Terms to avoid

| Avoid | Use instead | Why |
|---|---|---|
| 가져옴 (as a status) | 가져오기 완료 / 가져온 세션 / 가져온 소스 | Terse nominal verb; reads casual. |
| 처리됨 / 모두 처리됨 | 검토 완료 / 모두 검토 완료 | "Processed" hides what happened. |
| 적용됨 | 반영됨 | Mori uses 반영 for "applied to a surface". |
| 은퇴 / 은퇴됨 | 사용 중지 | 은퇴 reads like a person retiring. |
| "AI가 정리했어요" / "AI가 …한 항목" | "추론된 항목" / state the basis | Avoid AI-magic framing; inference is shown by the trust label. |
| 확인 / 실행 / 완료 (bare buttons) | a verb that names the result | Generic verbs hide meaning. |
| 모순됨 | 상충 / 상충됨 | Align to the shared lifecycle label. |

Note: full polite sentences like "소스를 가져왔습니다." in empty/help text are
fine · the rule targets terse nominal **labels/badges**, not prose.

## 5. Status vocabulary

These are owned by `product-state` and must not be re-spelled per surface.

**Availability** (English on purpose): Available / Partial / Planned /
Unavailable, with Korean sub-states 사용 가능 / 부분 구현 / 예정 / 사용 불가 /
설정 필요 / 데모 전용 / 브라우저 전용 / 데스크톱 전용.

**Trust** (`evidence/trust.ts`): 검증됨 (verified) / 관찰됨 (observed) /
추론됨 (inferred). Inferred shares the brand purple · an inference is Mori's
own reasoning.

**Data / provenance**: 가져온 소스 (imported) / 클라이언트 안전 (client-safe) /
사용자 입력 (user-provided) / 요약만 보관 (summary-only) / 원본 전체 보관
(full-text retained), plus the trust terms above.

**Memory lifecycle**: 수락 (accepted) / 편집 (edited) / 관찰 (watching) /
연기 (deferred) / 오래됨 (stale) / 상충 (contradicted) / 대체됨 (superseded) /
사용 중지 (retired).

**Companion**: 정보 / 제안 / 검토 필요 / 주의 / 검토 대기 / 보고 준비 /
이어가기 준비. A companion signal is always a reviewable suggestion, never an
automatic action.

**Notifications**: 알림 (the surface), with 모두 읽음 to clear the feed. The
sidebar bell carries an honest unread count capped at `9+`. A feed item names
what happened and where (프로젝트 · 세션 · relative time); it is derived from
reviewed data and is always a reviewable glance, never an alert that acts on
its own. The bell opens a right-side drawer; the 알림 page is the full
time-grouped inbox (오늘 / 이번 주 / 이전).

## 6. Button / action vocabulary

| Action | Label |
|---|---|
| Import a source | 가져오기 / 소스 가져오기 |
| Open a saved file | 불러오기 / 파일 불러오기 |
| Review | 검토하기 |
| Apply (to a surface) | 반영하기 / 타임라인에 반영 |
| Edit | 수정 |
| Exclude / discard | 제외 / 폐기 |
| Revert | 되돌리기 |
| Export | 내보내기 |
| Copy | 복사 |
| Open | 열기 |
| View detail | 상세 보기 |
| View source | 소스 보기 |
| View evidence | 근거 보기 |
| Attach to session | 세션에 연결 |
| Approve as memory | 기억으로 승인 |
| Build report | 보고서 생성 |
| Copy resume prompt | 재개 프롬프트 복사 |

A button labels the **result of the action**, not the implementation.

## 7. Source / import / capture vocabulary

- **가져오기 vs 불러오기 (decided):** Mori uses **가져오기** for bringing
  *external* source data in (a connector session, a git diff, pasted text) ·
  it is the established, precise Korean term and it is consistent across the
  app. **불러오기** is reserved for opening a *saved file* (a `.mori` package,
  the file picker). The two are not interchangeable.
- **기록에서 불러오기 (decided):** the new-session entry that opens an AI
  conversation Mori detected in the agent's own local history uses
  **불러오기**, not 가져오기. It opens records already present on the device
  (a file-pick-like gesture), so it reads as 불러오기 even though the loaded
  conversation becomes the session spine. Reserve 가져오기 for pasting or
  attaching *external* source data.
- **Imported (status):** 가져오기 완료 (a finished action), 가져온 세션 (a
  session's origin), 가져온 소스 (provenance of data).
- **Capture (수집):** explicit, user-triggered. Never imply background watching.
- **Live capture:** 실시간 수집 (only if/when a real live path ships).
- **Parsed / structured:** 분석됨 / 구조화됨.
- **Duplicate / already imported:** 이미 가져온 항목.
- **Attached:** 세션에 연결됨. **Applied:** 반영됨. **Review before apply:**
  검토 후 반영. **Discarded:** 제외 / 폐기.

## 8. Review / memory / report vocabulary

- **Review:** 검토. **Review queue:** 검토 대기열. **Candidate:** 후보.
- **Accept (review decision):** 수락. **Approve as durable memory:** 승인
  (`기억으로 승인`). Distinct on purpose · accepting a review item is not the
  same gesture as approving durable project memory.
- **Project memory / durable memory:** 프로젝트 기억.
- **Lifecycle:** 대체됨 (superseded) / 사용 중지 (retired) / 상충 (contradicted)
  / 오래됨 (stale).
- **Audit trail:** 변경 기록. **Revert:** 되돌리기. **Apply:** 반영.
  **Reject / discard:** 제외 / 폐기.
- **Report:** 보고서. **Resume prompt:** 재개 프롬프트. **Handoff:** 인계.
- **Export:** 내보내기. **Full export:** 전체 내보내기. **Client-safe export:**
  클라이언트 공유용 내보내기 (omits sensitive memory/audit history · say so).
- **`.mori` package:** `.mori` 패키지. **Included / excluded:** 포함됨 / 제외됨.

## 9. Tone rules

- Be concise and specific; cut filler and marketing.
- No over-friendly assistant voice ("~했어요", "~해드릴게요"). Use calm,
  declarative product copy.
- Primary UI is short; move explanation into disclosure / help / tooltips.
- Consistent noun/verb forms; a label names the product action or state, not
  the internal implementation.
- Be honest about capability · never imply capture Mori cannot do, or that a
  planned feature works.

## 10. Before / after

| Before | After | Where |
|---|---|---|
| 가져옴 | 가져온 소스 | Provenance badge |
| 가져옴 | 가져온 세션 | Session origin chip |
| Claude 대화 3건 가져옴 | Claude 대화 3건 가져오기 완료 | Import notification |
| 이미 가져옴 | 이미 가져온 항목 | Duplicate status |
| 모두 처리됨 | 모두 검토 완료 | Review overview |
| 사용자 편집 적용됨 | 사용자 편집 반영됨 | Consolidation proposal |
| 은퇴 / 은퇴됨 | 사용 중지 | Memory lifecycle |
| AI가 추론한 항목입니다 | 추론된 항목입니다 | Inferred issue card |

## 11. Icon / status visual pairing

Icons support recognition only · no decorative icons. Each key concept pairs
with one consistent lucide icon and the semantic tone from `product-state`:

| Concept | Icon (lucide) | Tone |
|---|---|---|
| Source / import | `Download` / `FileInput` | info |
| Capture | `Radio` / `CircleDot` | accent |
| Evidence / source ref | `Link` / `FileText` | observed/blue |
| Verified | `ShieldCheck` | verified/green |
| Inferred | `Sparkle` (single, not decorative) | inferred/purple |
| Needs review / attention | `AlertTriangle` | warning |
| Accepted memory | `BookmarkCheck` | success |
| Retired / superseded | `Archive` | neutral |
| Local / private | `Lock` / `HardDrive` | neutral |
| Client-safe | `ShieldCheck` | success |
| Planned / unavailable | dashed / muted, no solid icon | neutral |

Tone → colour is owned by `data-mori-tone` and `MoriStatusBadge`; never hand-pick
a status colour. Purple is brand/inferred only · it is not a generic status hue.

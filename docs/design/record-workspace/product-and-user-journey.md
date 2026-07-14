# Product definition and user journey · 기록 Workspace

## 1. Product definition

기록 Workspace는 사용자가 일상과 업무에서 발생한 원문 · 활동 · 생각 · 지식 ·
일정 · 수치를 마찰 없이 남기면, Mori가 이를 시간과 맥락에 맞는 구조화된
기록으로 정리하고, 사용자가 검토 · 수정 · 연결 · 재사용할 수 있게 하는
개인 활동 원장이다.

It is not a note list, not a calendar, not an AI input box. Three roles run
as one flow on one screen:

- **Capture**: leave anything, instantly.
- **Organize**: Mori understands and structures it.
- **Review & Reuse**: manage and re-encounter it across time, projects,
  knowledge, and patterns.

## 2. User jobs

| Job | User sentence | Target experience |
| --- | --- | --- |
| J1 즉시 남기기 | "생각난 김에 그냥 적는다" | one line in, within seconds you see what it became |
| J2 확인하고 고치기 | "제대로 이해했나? 아니면 고친다" | candidate cards; type/date/context fixed in a few taps |
| J3 시간 위에서 보기 | "이번 주 내가 뭘 했지?" | timeline with time-of-day, duration, density; ledger calendar |
| J4 몰아서 정리하기 | "미뤄둔 것들 한 번에 처리" | 확인할 것 strip + resolution cards |
| J5 다시 쓰기 | "지난번 그 결정 어디 있지?" | search, related records, weekly review, project history |

## 3. The journey

```text
CAPTURE     쓴다 · 자유 입력 / URL / 파일 / 붙여넣기.
            로컬 복구용 draft가 입력 중 보존된다 (기기 안, 임시).
            정리/저장 시점에 원문이 KernelSource로 보관된다 (영구, 손실 없음).
UNDERSTAND  Mori가 나눈다 · "기록 4건으로 이해했어요".
            유형 · 날짜(근거 포함) · 맥락 · 속성을 후보로 제안.
REVIEW      확인한다 · 카드에서 수정 · 제외 · (병합/분리는 확장점).
            확신 높은 항목은 접힌 요약, 확인 필요 항목만 카드.
PLACE       제자리에 놓인다 · 활동일의 타임라인 · 캘린더 · 프로젝트 ·
            트래커에 나타난다. 입력일과 활동일이 다르면 그 차이가 보인다.
REUSE       다시 쓰인다 · 검색 · 관련 기록 · 주간 리뷰 · 루틴 발견 ·
            에이전트 컨텍스트.
```

### Draft vs source (approved refinement 5.1)

Losing no user text is not the same as permanently storing every keystroke.

| Thing | What it is | Lifetime | Visibility |
| --- | --- | --- | --- |
| Draft | local recovery copy while typing | until saved or discarded by the user | "작성 중이던 내용을 복원했어요" on return |
| Capture source | the raw text at the moment of 정리/저장 | permanent (`retention: "retained"`) | 원문 보기 on every derived record |
| Records | the structured interpretation | permanent, revisioned | the ledger |
| Discarded input | user cleared the composer | gone (draft removed) | none |

Analysis failure preserves the source and proposes retry / manual organize /
later. The user can always cancel a draft; that deletes only the draft.

## 4. Apply policy as UX

The kernel's six-factor policy (confidence, mutates-existing, new-entity,
sensitivity, automation level, reversibility) maps to three visible
behaviours:

| Decision | Experience | Presentation |
| --- | --- | --- |
| auto | quietly saved; never hidden | toast "기록 N건 정리됨 · 되돌리기", collapsed summary row in review, Mori dot on the row |
| provisional | applied but marked; excluded from external outputs | 추정 label (orange), one tap to confirm |
| confirm | not in the ledger until the user decides | detailed candidate card in review; unresolved ones land in the 확인할 것 strip |

Reviewing a confirm card and pressing 저장 IS the confirmation: the kept
record persists as `active` with a user revision, not as a `candidate`.

A repeated correction (same fix three times) becomes a personalization rule
proposal, so the same decision is never demanded forever.

## 5. Success scenario (the vertical-slice acceptance test)

Input:

> 어제 MORI 기록 화면을 검토했고 오늘 러닝 1시간 했어.
> Activity와 Memory를 분리해야 한다는 생각도 들었고
> 다음에는 캘린더 날짜 추정 UX를 개선해야 해.

Expected, end to end, with no manual explanation:

1. While typing, a draft is recoverable after an app restart.
2. 정리 creates the capture source (visible as 원문 보관됨).
3. Four candidates appear: 업무 활동, 운동, 인사이트, 할 일.
4. The 업무 candidate shows 어제 as **추정** with its evidence word.
5. The 운동 candidate carries 오늘 and 60분 (parsed from "1시간").
6. The 인사이트 may be saved without a date.
7. The 할 일 shows 예정일 없음.
8. The user can change type, date, and context on any candidate, and
   exclude any candidate.
9. 저장 persists the kept records to the existing ledger repositories.
10. Each record links back to the source; AI interpretation and user edits
    are distinct revisions.
11. Immediately after saving, undo is available and works.
12. After an app restart the records are still there.

# Mori context workspace · architecture proposal v1

Status: **proposal, 2026-07-14.** This is the revised direction + architecture
the user requested after rejecting the conservative parts of
[`mori-personal-context-workspace-direction.md`](mori-personal-context-workspace-direction.md)
(§4.2 and §5 of that doc are superseded here; its §1-§3 record of intent and
mockups stays valid). No code has been written against this doc. The
canonical goal rewrite (`mori-project-goal.md`) waits until the user reviews
this proposal.

What the user corrected, in order (all accepted here):

1. User-authored text is not "nothing to review". Raw capture and AI
   interpretation are two different acts with different policies (§5).
2. Mori must discover higher-order units from repetition: routines,
   episodes, workstreams, patterns (§6).
3. User corrections must accumulate into a personalization layer, not
   evaporate as one-off edits (§7).
4. The memory screen's fate must be re-derived from the new IA, not
   pre-decided as "narrow and keep" (§8.3).
5. Existing implementation survival is not a goal. Everything is classified
   Reuse / Adapt / Deprecate / Remove on merit (§9).
6. `.mori` must be re-derived from purposes, not assumed (§11).
7. Storage needs a real three-way comparison with an end state and a
   transition path, not a one-line "one-way mirror" (§10).
8. 운동·영어·투자 are examples. The kernel must be generic; the pilot may be
   narrow but the model may not be (§3, §12).
9. Record types are schemas-as-data, never a growing hardcoded enum (§3.2).
10. The whole pipeline is redefined (§4).

**Round 3 additions (same day, condition of the D0 go-ahead):** §16-§21
codify the meta-principles the user required before the canonical rewrite:
decision authority order, the legacy assumption audit, the target-vs-
transition split, the risk treatment policy, test/doc migration, and legacy
removal criteria. Two direct user additions are folded in: the **raw-input
retention invariant** (§16.4) and **low-ceremony use** (§16.3).

## 1. Product identity (revised statement)

> Mori is a local-first **personal context workspace**. The user throws
> traces at it, free text, URLs, files, pasted conversations, Git history,
> AI-agent sessions, or connects sources that feed it automatically within
> an approved scope. Mori turns those traces into a structured, connected
> ledger of **records**: what the user did, learned, decided, felt, and
> produced, anchored to the time it actually happened and the contexts it
> belongs to. It discovers repetition and structure, learns the user's
> vocabulary and preferences, and gives everything back when needed:
> recall, daily and project history, continuation, review, reports,
> portfolio, tracker insight, and agent context.

Three sentences of consequence:

- The center is the **record ledger**, not any single source kind. An AI
  session is one trace among many; so is a Git log; so is a one-line memo.
- **Agents** are a world of live work (sessions to follow, continue, and
  mine for activity). **Input channels** are how traces arrive. They are
  different axes and never share one screen model.
- **Origin (provenance) is a property of every record**, shown when asked,
  enforced internally, and never a destination the user manages.

What Mori is not: a chat archive, an evidence manager, a session viewer
first, a cloud service, or a surveillance tool. The three privacy rails
(scope · review-gate for AI interpretation · transparency) are unchanged
invariants.

## 2. Layer model

```text
Source layer      raw traces + provenance (never the user's working unit)
      ↓ parse / understand / propose / resolve / apply
Ledger layer      records: activities, notes, tracker entries, tasks,
                  events, agent-session records ... (time + context anchored)
      ↓ aggregate
Structure layer   day summaries, work episodes, routines, project state,
                  patterns (discovered, user-confirmed once, then live)
      ↓ distill
Distilled layer   knowledge, insights, decisions, principles, preferences
                  (long-lived, lifecycle-governed, audit-trailed)
      ↓ reuse
Reuse layer       search, recall, 오늘/캘린더/프로젝트 views, resume,
                  reports, portfolio, tracker charts, agent context
```

"Durable memory" is **not a separate store or screen**: it is the distilled
layer, and the existing accepted-memory machinery (lifecycle, audit,
provisional status, governance policy) becomes its internal engine. The
ledger is the product; distillation is one of its outputs.

## 3. Domain model (the kernel)

### 3.1 Objects

| Object | Purpose | Key fields |
| --- | --- | --- |
| `Record` | The universal unit | id, `schemaId`, title, body, three times (§3.3), timeBasis + confidence, status, origin (`user / import / agent / automation / derived`), ownership (`db / file`, §10), contexts, revision head |
| `SchemaDefinition` | A record type **as data** | id, name, scope (`system / user`), property definitions (key, type, validation), display rules, analysis rules (what to extract, how to summarize), metric definitions |
| `RecordProperty` | Typed values per schema | recordId, key, value (text / number / duration / date / json / entityRef) |
| `Context` | Where records belong | id, type (`project / workstream / topic / area / routine / person / custom`), name, parent, archived |
| `Entity` | A stable named thing | id, type (exercise, term, ticker, person, tool, place ...), canonicalName |
| `EntityAlias` | Names the user uses | entityId, alias, addedFrom (user correction / import) |
| `Relation` | Typed links | from, type (`belongs-to / part-of / derived-from / supports / contradicts / references / follows / duplicates`), to (record / context / entity) |
| `Source` | An origin trace | id, kind, uri/locator, raw body or hash per retention policy, publishedAt, capturedAt, contentHash |
| `SourceLink` | Origin as a role | sourceId, recordId, role (`origin / supports / references / contradicts / inspired`), locator (line span, timestamp range), confidence |
| `Derivation` | Explainability | recordId, engine + model + promptVersion, inputs (sourceIds), confidence, createdAt |
| `Revision` | Append-only history | recordId, actor (`user / ai / rule`), operation, before/after, createdAt |
| `Rule` | Personalization (§7) | id, kind (alias / classification / context-binding / summary-preference / automation-level / extraction-template / date-inference), condition, effect, learnedFrom (revisionIds), enabled |

Metrics are **projections**, not a separate authored object: a schema marks
properties as metric-bearing (`durationMinutes`, `reps × sets`, `amount`),
and a derived index table materializes time-series per (entity, property)
for charts and trends. No metric is ever hand-authored outside a record.

### 3.2 Schemas as data, not enum

The DB stores `schemaId`, never a `workout` column or a Rust/TS enum that
must grow per domain. Mori ships **system schemas** as versioned data files
(seed set: `activity`, `note`, `knowledge`, `insight`, `decision`, `task`,
`event`, `daily-entry`, `agent-session`, `source-document`,
`portfolio-item`, plus tracker exemplars `workout`, `study-session`,
`investment-entry`, `meeting`, `reflection`). Users create **user schemas**
with the same shape. Search, calendar, contexts, AI analysis, export, and
the inbox all operate on the `Record` interface and read the schema for
display/validation/extraction rules, so a user-defined `수면` or `독서`
schema is a data change, not a code change.

The breadth this must carry without schema-per-domain code: work, project
development, meetings and decisions, research, reading, articles, videos
and lectures, language learning, certification study, writing, ideas,
exercise, health, sleep, meals, habits, emotions and reflection, schedules,
travel, purchase comparisons, personal finance, investing, devotions,
relationships, family records, creative work, game development, music,
career and portfolio, long-term goals. None of these is hardcoded; all of
them must be expressible as schema + context + entities.

### 3.3 Three times, honestly

Every record carries `occurredStart/occurredEnd` (activity time),
`sourceCreatedAt` (the trace's own date), `capturedAt` (entered Mori), plus
`timeBasis` (`source-exact / source-observed / user-provided / ai-inferred /
capture-fallback / unknown`) and confidence. Calendar and 오늘 key on
activity time; `unknown` is a first-class state with an inbox affordance
(오늘로 처리 / 날짜 지정 / 프로젝트에만 / 미정 보관), never fabricated.

## 4. Pipeline (redefined)

```text
Capture    raw text / URL / file / paste / Git / agent session / connected
           source. Raw trace is preserved IMMEDIATELY, always (§5).
Parse      deterministic structure: metadata, dates, segments, diff stats.
Understand engine seam (rule-based / Ollama / OpenAI-compatible): intent,
           language, topics, candidate structure.
Propose    typed record candidates (activity, knowledge, task, event,
           tracker entries, decisions ...) each with confidence + derivation.
Resolve    link to existing entities / contexts / episodes; duplicate,
           repetition, and conflict detection; alias resolution.
Apply      per-candidate policy: auto / provisional / confirm (§5.2).
Aggregate  day summaries, work episodes, routines, project state, patterns.
Distill    long-lived knowledge / principles / decisions / preferences via
           the governance engine (lifecycle + audit + provisional).
Reuse      search, 오늘 / 캘린더 / 프로젝트 / 지식 / 트래커 views, resume,
           reports, portfolio, agent context.
```

Existing assets map onto stages rather than surviving as destinations:
import parsers → Parse; Quick Pass engine seam → Understand/Propose; dedupe
+ connectorEventId → Resolve; Import Review mechanics → Apply's confirm
mode; project synthesis → Aggregate; consolidation + governance +
provisional → Distill; Ask Mori / resume / reports → Reuse.

## 5. Capture vs interpretation (the corrected policy)

### 5.1 The two acts

- **Raw capture.** What the user typed or provided is preserved instantly
  and losslessly as a `Source` (+ a plain note record when the input *is*
  the content). This never waits for review; user text is never lost or
  held hostage by a queue. This is the part my earlier "직접 쓴 텍스트는
  즉시 저장" got right.
- **Interpretation.** Everything derived from it, structured tracker
  entries, extracted tasks, classifications, entity links, routine
  proposals, is an AI/rule act with its own confidence and its own apply
  policy. This is the part the earlier framing wrongly skipped: turning
  casual text into structured, reusable records is Mori's core job, and it
  applies to user-authored text just as much as to imports.

### 5.2 Apply policy matrix

Per candidate, the policy is a function of six factors, not of "who wrote
the input":

| Factor | Toward auto | Toward confirm |
| --- | --- | --- |
| Interpretation confidence | high, schema match clean | low, ambiguous |
| Mutates existing records? | creates new only | edits / merges / renames |
| Creates new entity/context? | resolves to known | proposes new |
| Sensitivity | none detected | secrets / PII / finance detail |
| User automation level | per schema/context setting: auto | setting: always ask |
| Reversibility | single-record, undoable | cross-record, hard to undo |

Three outcomes: **auto-apply** (recorded with a Revision, undoable,
disclosed in the day summary as "Mori가 정리함 N건"), **provisional**
(applied but marked, recallable, excluded from external outputs, exactly
the existing provisional semantics), **confirm** (an inbox card). Defaults:
a clean workout memo with known entities → auto; the same memo introducing
a new exercise entity → auto the entry, provisional the entity; anything
that rewrites existing records (a rename, a merge) → confirm with preview;
anything sensitive → confirm. Users can tighten or loosen per schema and
per context; those settings are `Rule` rows (§7), visible and editable.

## 6. Higher-order structure discovery

Proposers run **over the ledger**, not only at capture time:

- **Routine**: same schema + overlapping entities recurring N times in M
  weeks → routine context proposal ("주 3회 러닝이 반복돼요. 루틴으로
  만들까요?"). Once confirmed, future entries auto-attach.
- **Work episode**: activity clusters sharing files / branch / context /
  narrative continuity across days → episode proposal ("이 5일의 작업을
  'MORI 메모리 구조 재설계'로 묶을까요?"). Portfolio derivation consumes
  episodes first.
- **Workstream**: episodes sharing direction over weeks → a workstream
  context proposal.
- **Pattern**: recurring sequences (model review → UI design → storage
  review) surfaced as observations in reflections and project state, not
  auto-created containers.

Discovery proposals always enter Apply as provisional or confirm (they
reorganize, so never silent). Aggregates (day summary, project state)
recompute live and are records themselves, so they are searchable,
exportable, and citable.

## 7. Personalization layer

Every user correction is a signal; durable ones become `Rule` rows:

- "달리기 말고 러닝으로" → `EntityAlias` + display-name change, with scope
  choice (표시 이름만 / 과거 본문도 / 이번 기록만).
- "이런 작업은 개인 연구로 분류해" → classification rule (condition:
  schema/keywords/source, effect: context binding).
- "이 저장소는 항상 tcc-ng-gw에 연결" → context-binding rule.
- "영어 기록은 표현 중심으로 요약해" → summary-preference rule consumed by
  the schema's analysis rules.
- "이건 그냥 자동으로 넣어줘" → automation-level rule (per schema/context).
- Repeated identical edits without an explicit ask → Mori proposes the
  rule ("최근 5번 연속 X를 Y로 고치셨어요. 규칙으로 만들까요?"), sourced
  from Revision history.

Rules are records too: visible on a "Mori가 배운 것" settings surface,
editable, disable-able, exportable, and every automated application cites
the rule in its Derivation, so personalization never becomes an invisible
black box.

## 8. Information architecture

### 8.1 Navigation

```text
홈        ambient canvas + ⌘K (doctrine unchanged; not a dashboard)
오늘      the day's ledger: activities, tracker entries, 배운 점, 예정,
          자동 정리 요약, quick capture
캘린더    activity-time calendar over the ledger (등록일/원본일 필터)
프로젝트  context pages: history, decisions, knowledge, outputs, next
지식      distilled knowledge / insights / notes (file-canonical class)
트래커    schema-grouped record views + metric charts (운동/학습/투자/...)
에이전트  live sessions + session history + per-session activity extraction
인박스    capture + Apply queue (confirm cards, date-unknown, exceptions)
검색      global search over records / contexts / entities / sources
설정      연결(에이전트 + 입력 채널 + 자동 수집 범위), 스키마, 규칙, 저장
```

연동 as a top-level content surface ends: **agents get a world, input
channels become capture affordances (inbox) + connection settings.**

### 8.2 The agent world

Per agent: live session follow (existing), session history (existing
discovery readers), and per-session **"기록으로 변환"**: the activity /
decision / knowledge / task candidates extracted from that session, entering
the same Apply pipeline. The session detail view (개요/활동/분석/공유)
survives as the deep view of one agent session; its analysis output now
*produces ledger records* instead of terminating in a project-memory silo.

### 8.3 Memory screens, re-derived (not pre-decided)

Jobs the current surfaces perform, and where each job lands in the new IA:

| Current job | New home |
| --- | --- |
| Search all memory | 검색 (global, over all records incl. distilled) |
| Browse durable knowledge | 지식 + each 프로젝트 page section |
| Review proposals (통합 검토) | 인박스 confirm cards (the exception queue) |
| Provisional visibility | inline marks on records + 오늘 "자동 정리" summary + inbox filter |
| Audit / revert | record detail history (Revision) + 설정 > 저장 |
| Storage transparency | 설정 |

Every job has a better home, so the verdict is: **Deprecate both the 메모리
hub screen and the standalone Consolidation Review screen.** They stay
palette-reachable during migration and are removed after the new surfaces
reach parity. The engine underneath (lifecycle, audit, provisional,
governance policy, stale/contradiction detection) is **Reused** as the
Distill stage. User-facing vocabulary 통합/확정/잠정/승격 is **Removed**;
surfaces speak plain language (자동으로 정리됨 · 확인 필요 · 보관됨), per
the existing no-internal-vocabulary rule. This supersedes my earlier
"narrow and keep" position; the user's instinct that the screen would
confuse the new product is right, because its IA *is* the old pipeline.

## 9. Reuse / Adapt / Deprecate / Remove

Verdicts on every element the user listed, plus neighbors. "Deprecate" =
kept working and palette-reachable during migration, removed after parity;
"Remove" = does not survive into the new product at all.

| Element | Verdict | Reasoning / destination |
| --- | --- | --- |
| Evidence Hub (session 자료 view) | **Deprecate** | Origin browsing moves into record detail ("이 기록의 출처") and the project source browser. No evidence destination. |
| Memory Hub (global 메모리 screen) | **Deprecate** | §8.3. Jobs redistributed; engine reused. |
| Consolidation Review screen | **Deprecate** | Becomes the inbox confirm queue with 반영/수정/무시. |
| Accepted-memory store + audit + provisional | **Reuse** | The distilled layer's engine. Data migrates into distilled records with lifecycle preserved. |
| Session-centric data model (session stores, MockSession) | **Adapt** | A session becomes an `agent-session` record + `Source`. Stores keep powering the agent world until re-root completes; "session = spine of all work" dies in doctrine. |
| TimelineEvent | **Adapt** | Becomes source-scoped evidence events feeding Parse/Propose; the session timeline view keeps rendering them inside the agent world. |
| SourceRef | **Adapt** | Becomes `Source` + `SourceLink` (role, locator). `sessionId` coupling removed; trust/redaction/retention fields carry over. |
| `.mori` v0 package | **Deprecate** | §11: v1 workspace package designed from purposes; v0 kept import-only for migration. |
| Reports | **Adapt** | Builders re-target ledger aggregates (day / episode / project). Report surface stays. |
| Resume Prompt | **Reuse (adapt inputs)** | Agent context is a first-class Reuse output; consumes project state + episodes + distilled records. |
| Import Review | **Adapt** | Generalizes into Apply's confirm mode inside the inbox; per-event accept survives for low-confidence batches. |
| 연동 screen | **Adapt + split** | Agents → 에이전트 world; channels → inbox capture + 설정 > 연결. |
| 프로젝트 screen | **Adapt** | Becomes the context page over the ledger (history, decisions, knowledge, outputs, next). |
| Memory terminology (통합/확정/잠정/승격 on surfaces) | **Remove** | Internal-only; surfaces use plain language. |
| Quick Pass engine seam (rule/Ollama/OpenAI) | **Reuse** | The Understand/Propose engine, per-schema analysis rules feed it. |
| Live session (라이브) | **Reuse** | Agent world centerpiece, unchanged doctrine. |
| Reconstruction Lab (재구성) | **Keep as agent-world lens** | Session-scoped reading lenses; unaffected by the pivot. |
| Ask Mori | **Adapt** | Answers over the whole ledger + distilled layer, provisional disclosure kept. |
| Workbench | **Re-evaluate after IA lands** | Its multi-panel job may be covered by 검색 + views; decide with usage, per row 22. |
| Governance auto-organize (confirmed-decision auto) | **Reuse** | Becomes one Apply default among schema policies. |
| 검토 전 자동 반영 방지 rails | **Reuse (generalized)** | The Apply matrix *is* the generalized rail. |

The revised working rule replacing absolute retire-don't-delete: **retire is
a migration tactic, not an end-state guarantee.** Nothing is deleted while
it is the only path to data or parity; anything may be removed once the new
model covers its job and data has migrated losslessly.

## 10. Storage ADR: three options compared

### 10.1 Options

- **A. SQLite canonical + deterministic Markdown export.** All records in
  SQLite; a pure, deterministic exporter renders the workspace folder
  (front-matter + body per record, folder layout by §10.4). Files are
  regenerable artifacts; external edits are detected (hash) and offered as
  re-import diffs, never silently absorbed or overwritten.
- **B. Split ownership.** Content class decides the canonical side:
  user-authored prose (지식 노트, 저널 본문, 자유 메모) is **file-canonical**
  (Mori watches, parses front-matter minimally, indexes); structured and
  derived records (tracker entries, activities from imports, metrics,
  episodes, rules, distilled lifecycle) are **SQLite-canonical**, mirrored
  to read-marked files. Every record carries `ownership: file | db`.
- **C. Markdown canonical + SQLite index for everything.** All records are
  files; SQLite only indexes.

### 10.2 Comparison

| Criterion | A | B | C |
| --- | --- | --- | --- |
| Data integrity | strong | strong (boundary enforced by `ownership`) | weak for structured data: hand-edited front-matter corrupts properties/relations/metrics |
| User ownership | files exist but are copies | **high where it matters**: the prose users actually own is theirs | maximal in principle |
| External editing | detect + re-import diff only | **native for prose**, detect-only for structured | native but conflict-prone |
| Search performance | full FTS | full FTS | index must chase files; rebuild cost |
| Relations / properties | first-class tables | first-class tables | encoded in front-matter; fragile, verbose |
| Schema evolution | migrations | migrations + tolerant front-matter | migrating thousands of user-editable files |
| Conflict resolution | none needed | narrow (prose only, mtime+hash, 3-way on body) | pervasive |
| Backup / restore | one DB + assets | DB + file tree (both in `.mori`) | file tree (+ index rebuild) |
| Export / re-import fidelity | lossless via `.mori`; MD export lossy-by-design | same | MD *is* the store; structured fidelity suffers |
| Dev complexity | **low** | medium | high |
| Long-term durability | depends on exporter honesty | **best of both**: prose survives Mori; structure stays sound | prose survives; structure decays |

### 10.3 Decision

**Target end state: B.** Prose the user writes deserves real file
ownership (the Obsidian instinct); structured and derived data needs
transactional integrity that hand-editable files cannot give.

**Path: A first, with B designed in from day one.** Stage 1 ships A
(canonical SQLite, deterministic export, workspace folder, external-edit
detection) *with the `ownership` field, the folder layout, and the
front-matter contract already fixed to B's shape*, so stage 2 (flipping the
prose class to file-canonical with a watcher and 3-way body merge) changes
ownership flags and adds the watcher, not the format. Stage 3 evaluates
widening the file-canonical class only if real external-edit usage demands
it. C is rejected for structured records for the reasons above; note that
inside B, the prose class effectively *is* C, scoped to where it is safe.

### 10.4 What the user gets, concretely

Workspace folder (always present from stage 1, Obsidian-openable):

```text
Mori/
├─ Journal/2026/2026-07-14.md          (day summaries + user journal)
├─ Activities/2026/07/…                (mirrored activity records)
├─ Projects/<name>/…                   (project page, decisions, episodes)
├─ Knowledge/…                         (file-canonical from stage 2)
├─ Trackers/<schema>/…                 (mirrored entries + metric summaries)
├─ Agent Sessions/…                    (session summaries; raw per retention)
├─ Sources/…                           (retained raw bodies per policy)
├─ Assets/…
└─ .mori/ (index.sqlite, schemas/, rules/, settings)
```

User-visible commands and their mechanics:

- **워크스페이스 폴더 열기**: opens the folder; it is always current
  (export runs incrementally on change, debounced).
- **Markdown / Obsidian Vault로 내보내기**: writes the same tree to a
  chosen location, with wiki links between records, front-matter carrying
  `mori_version / id / schema / occurred_at / contexts / entities`;
  Obsidian ignores what it does not know. Lossy-by-design (no lifecycle
  internals, no revision history) and labeled as interchange, not backup.
- **부분 내보내기**: by project / context / schema / date range; the
  exporter filters records and pulls the transitive closure of linked
  entities + contexts so links stay resolvable.
- **다시 가져오기 / 병합**: re-import runs the same Resolve stage: stable
  record ids match first, then content hash, then title+time heuristics;
  conflicts become confirm cards (mine / theirs / both).
- **변경 사항 비교 / 외부 수정 감지**: per-file content hash + mtime; a
  detected external edit on a db-canonical mirror becomes an inbox diff
  card; on a file-canonical note it is simply ingested (stage 2).

## 11. `.mori` package v1 ADR sketch

**Purposes first.** Three distinct jobs, one engine, not one format forced
onto all:

1. **Backup / device move**: lossless, everything including lifecycle,
   revisions, rules, sources per retention, optional prebuilt index.
2. **Selective share / export**: project / date-range / schema scoped,
   sensitivity-filtered (secrets and excluded-sensitivity records never
   leave), stable ids preserved so re-merge works.
3. **Human interchange**: the Markdown/Obsidian export of §10.4; explicitly
   lossy; NOT `.mori`.

v0 (session + accepted-memory shaped) does not fit the record model:
**Deprecate**; keep import-only support that converts v0 slices into
records (sessions → agent-session records + sources; accepted memories →
distilled records with lifecycle).

v1 layout (versioned workspace package):

```text
workspace.mori (zip)
├─ manifest.json         (formatVersion, appVersion, scope, counts, checksums)
├─ schemas/*.json        (system-schema versions + user schemas)
├─ records.ndjson        (with schemaId, times, status, ownership)
├─ properties.ndjson / relations.ndjson / contexts.json
├─ entities.json / aliases.json / rules.json
├─ sources.ndjson        (+ raw bodies under sources/ per retention)
├─ revisions.ndjson      (backup scope only)
├─ assets/
└─ markdown/             (optional human-readable rendering, convenience)
```

Requirements the implementation must test: format versioning + forward
migration; stable ids round-trip; relations survive partial export via
transitive closure; merge-on-import uses the Resolve stage with explicit
conflict policy (skip / replace / duplicate / ask); checksum integrity;
sensitivity filters applied at write time, verified by test; round-trip
fidelity test (export → wipe → import → deep-equal on canonical fields).

## 12. Migration plan (no data loss, no big-bang cutover)

1. **Additive kernel.** New tables land beside existing ones. Nothing old
   is dropped.
2. **Converters, not rewrites.** Existing data maps in: sessions →
   `agent-session` records + `Source` rows; timeline events →
   source-scoped events; accepted memories (incl. provisional + audit) →
   distilled records with lifecycle + revisions preserved; projects →
   contexts; `.mori` v0 imports → converted on read.
3. **Dual-run window.** Old surfaces read old stores; new surfaces read
   the ledger. Converters are idempotent and re-runnable; the old stores
   stay untouched (rollback = keep using them).
4. **Cutover per surface.** A surface moves when its new home reaches
   parity (checklist per surface); deprecated screens stay
   palette-reachable until their data and jobs are fully served, then are
   removed.
5. **Validation.** Converter round-trip tests on real desktop data; record
   counts and spot-audits surfaced in a migration diagnostics card
   (observable validation, per the user's standing request).

## 13. Scenario validation (12)

Format: 입력 → Records → Context/Entity → 시간 → 정책 → 재활용.

1. **Git + AI 세션에서 프로젝트 업무 복원.** 지난주 커밋 8개 + Claude 세션
   2개 가져오기 → Parse가 커밋 날짜·브랜치·파일군 추출, Propose가 날짜별
   activity 후보 3건 + episode 후보 1건("메모리 구조 재설계") 생성 →
   Context: 프로젝트 mori; Entity: 파일·브랜치 → 시간: source-observed
   (커밋 시각), 세션은 source-exact → 정책: activity 후보는 provisional
   (AI 병합 판단 포함), episode는 confirm → 재활용: 캘린더 지난주에 표시,
   프로젝트 히스토리, 포트폴리오 후보, resume 컨텍스트.
2. **자유 운동 메모.** "오늘 운동 러닝 10분, 팔굽 5개 3세트" → 원문 즉시
   보존 + workout 스키마 entry 1건(항목 2개) → Entity: 러닝, 팔굽혀펴기
   (기존) → 시간: user-provided(오늘) → 정책: auto (high confidence, 신규
   entity 없음, 민감성 없음), 오늘 요약에 "Mori가 정리함" 표기 → 재활용:
   트래커 차트, 주간 운동량, 루틴 발견 입력.
3. **영어 학습.** "shrug off, 대수롭지 않게 넘기다 + 예문" 붙여넣기 →
   study-session entry + expression 지식 레코드 2건 → Entity: 표현들 →
   시간: user-provided → 정책: entry auto, 지식 레코드는 provisional (AI
   가 뜻/예문 보강 시) → 재활용: 지식 검색, 복습 뷰, summary-preference
   규칙("표현 중심") 적용 대상.
4. **투자 판단 + 감정.** "삼전 일부 매도. 실적 우려. 좀 불안했음" →
   investment-entry (행동: 매도, 판단 근거, 감정: 불안) → Entity: 종목 →
   시간: user-provided → 정책: 금융 민감 → confirm (사용자가 automation
   수준을 올리면 auto로) → 재활용: 투자 히스토리에서 판단 vs 감정 추이,
   회고 ("불안 매도가 3회 반복됨" 패턴 관찰). 투자 조언은 생성하지 않음.
5. **블로그/기사 분석.** URL 입력 → 본문 fetch → source-document +
   knowledge 후보 2건 + insight 후보 1건 → Context: 주제 topic → 시간:
   활동=오늘(읽음), sourceCreatedAt=게시일(2024) → 정책: knowledge
   provisional, insight confirm(프로젝트 연결 제안 포함) → 재활용: 지식
   그래프, 관련 프로젝트 인용, 검색.
6. **YouTube 학습.** URL + 자막 붙여넣기 → source-document(타임스탬프
   세그먼트) + 배울 점 3건 + 실행 항목 1건, explicit/inferred 구분 표기 →
   시간: 시청일=오늘, 게시일=원본 → 정책: 배울 점 provisional, 실행 항목
   confirm(task 생성) → 재활용: 학습 인박스, 프로젝트 적용, 타임스탬프로
   원 구간 재열람.
7. **회의록 → 결정 + 후속 작업.** 회의록 붙여넣기 → meeting 레코드 +
   decision 2건 + task 3건 + 참석자 Entity 연결 → 시간: 회의 시각
   (본문에서 ai-inferred, confidence 표기) → 정책: meeting auto, decision
   confirm(팀 관련 민감), task confirm → 재활용: 프로젝트 결정 히스토리,
   다음 작업, 사람별 흐름(person context).
8. **일일 회고/묵상.** 저녁에 자유 텍스트 → reflection 레코드
   (file-canonical 산문) + 감정 태그 + 오늘 활동과의 관계 링크 제안 →
   정책: 원문 auto(사용자 산문), 링크 제안 provisional → 재활용: Journal,
   주간 회고 aggregate, 감정 추이.
9. **구매 비교.** "모니터 A vs B, A가 주사율 좋고 B가 싸다" → comparison
   레코드(옵션·기준 속성) + 결정 대기 task → 정책: auto → 재활용: 나중에
   "그때 왜 A 샀지?" 검색, 결정 기록으로 연결.
10. **프로젝트 이력 → 포트폴리오.** "mori 프로젝트 포트폴리오 만들어줘" →
    Aggregate가 episodes + decisions + outputs를 수집, portfolio-item
    초안 생성(성과 문장 + 근거 링크) → 정책: confirm(외부 표현물) →
    재활용: 이력서용 변환, 부분 내보내기.
11. **장기 루틴 발견.** 6주간 흩어진 운동 entry들 → Routine proposer가
    "주 3회 러닝" 루틴 후보 → 정책: confirm → 이후 신규 entry 자동 부착,
    지속성 지표, 중단 감지("2주째 기록 없음"은 조용한 표시만).
12. **용어 변경 전파.** "달리기 말고 러닝으로 불러줘" → EntityAlias 추가
    + 표시명 변경, 범위 선택 제시 → 정책: 표시명 변경은 auto(가역),
    과거 본문 수정은 confirm → 재활용: 모든 과거 기록·차트·검색이 새
    명칭으로, 별칭 검색 유지, 규칙으로 축적되어 다음 파싱에 반영.

Each scenario exercises: raw-vs-interpretation split (2, 3, 8), three-time
honesty (1, 5, 6), entity stability (2, 12), discovery (1, 11), policy
matrix breadth (4, 7, 10), file ownership (8), and reuse surfaces (all).

## 14. Execution order (proposal)

Slices stay small and shippable; **the model never narrows to the slice.**

- **D0. Review this doc** → rewrite `mori-project-goal.md` identity +
  `domain-model.md` kernel + IA doc. (The one step still gated on the
  user.)
- **K1. Kernel.** Tables + TS domain + schema registry (schemas as data,
  ≥5 system schemas seeded, 1 user-defined schema exercised in tests) +
  Derivation/Revision/Rule + FTS. Converters for projects/contexts start
  here.
- **K2. Capture + Apply + 인박스 + 오늘.** Quick capture (text / URL /
  paste), Understand/Propose over the engine seam, the Apply matrix with
  per-schema automation settings, inbox confirm cards, 오늘 view. Pilot
  schemas: workout + study + note + url-document (four, not one, to prove
  the kernel generalizes; still a narrow slice of the domain list).
- **K3. Agent re-root + discovery.** Session pipeline emits activity
  candidates; episode/routine proposers; 캘린더; project context pages
  over the ledger; personalization rules v1 (alias, classification,
  automation level).
- **K4. Knowledge + storage stage 2 + `.mori` v1.** File-canonical prose
  class + watcher; Obsidian export; `.mori` v1 with round-trip tests;
  portfolio derivation; memory-surface deprecation completes.

Throughout: migration converters + diagnostics (observable), deprecated
screens palette-reachable until parity, validation per the standing policy.

## 15. Defaults chosen (overridable, not re-asked)

Per the user's instruction to present best answers instead of returning
decision lists: this doc **decides** (a) storage = §10.3 staged A→B;
(b) memory hub + consolidation screens = deprecate per §8.3; (c) `.mori` =
v1 redesign + v0 import-only; (d) nav set = §8.1; (e) pilot schema set =
workout + study + note + url-document; (f) record types = schemas as data.
D0 was approved 2026-07-14 conditional on §16-§21 below.

## 16. Decision authority order

When designs conflict, judge in this order. A lower item never overrides a
higher one:

1. The user's real problem and product intent
2. A long-term coherent user experience
3. An extensible domain model and data structure
4. Privacy, data integrity, transparency, reversibility
5. Migration and existing-user-data compatibility
6. Reusability of current code and docs
7. Short-term implementation convenience and change cost

**Existing Mori is material for future Mori, not its boundary.** (기존
MORI는 미래 MORI를 위한 재료이지, 미래 MORI의 경계가 아니다.) The wrong
order is: existing code and rules → compute the feasible envelope → shrink
the new product into it. The right order is: the user's problem → the
target product → the ideal domain and information structure → safety and
integrity → then decide which existing assets serve that, and plan the
migration. Implementation convenience or keeping legacy tests green never
overrides a product decision; a test that encodes old doctrine is rewritten
with the doctrine (§20).

### 16.1 Product vs safeguard

Evidence, provenance, review, audit, revisions are not the product's
purpose; they are what makes the product trustworthy. SQLite, Markdown,
`.mori`, FTS, SourceLink are not what the user comes for; they are means.
What the user must see is: 오늘 무엇을 했는가 · 프로젝트가 어떻게
진행됐는가 · 무엇을 배우고 생각했는가 · 어떤 결정을 했는가 · 무엇이
반복되고 있는가 · 앞으로 무엇을 해야 하는가 · 과거 기록을 지금 일에
어떻게 다시 쓰는가. Internal structure never dictates surface vocabulary
or screen existence.

### 16.2 UI is derived from jobs, not from legacy screens

When designing a surface: do not start from "where do the existing
components move". Define what the user is trying to do, prove each
screen's reason to exist against the new IA, and actually remove screens
that fail the proof. Provenance / revision / lifecycle / audit may live on
internally without the user managing them under those names.

### 16.3 Low-ceremony use (user addition)

The default experience is: capture → Mori organizes → the user glances.
Approval ceremonies are the **exception path**, reserved for the §5.2
matrix's confirm outcomes (mutating existing records, new entities at low
confidence, sensitive content). A user who never opens the inbox must
still get a well-organized ledger from auto + provisional outcomes, with
undo. Extensibility must not cost complexity: a new life domain arrives as
a schema (data), never as a new surface, new nav item, or new concept the
user must learn first.

### 16.4 Raw-input retention (user addition, new invariant)

Whenever Mori derives records from an input, including the user's own
memos, the original input is preserved as a `Source` by default: locally,
with sensitivity redaction still applied, under user-controllable
retention. It need not be shown prominently, but it must exist, because
re-derivation (better models, new schemas, corrected rules) always reads
the **raw source**, never a previous interpretation. Deleting raw sources
is a user action with a clear consequence note ("재분석 불가"), never a
silent policy.

## 17. Legacy assumption audit

Not all current rules have the same strength. Every existing rule is one
of four classes; the class decides how it is treated during the rewrite.

### 17.1 Invariants (keep; identity-level)

| Rule | Why it arose | Still valid? |
| --- | --- | --- |
| No covert capture (camera/screen/keylog/unconnected apps, the A-ban) | Trust identity of the product | Yes, unconditionally |
| Origin and AI interpretation always distinguishable | Anti-hallucination honesty | Yes; enforced by Source/Derivation |
| No data loss, no silent overwrite | User owns the ledger | Yes; §12, §19 |
| Automated changes are visible and reversible | Same | Yes; Revision + undo + disclosure |
| Never fabricate unknown dates or facts | Honesty | Yes; `timeBasis: unknown` is first-class |
| Local-first, no cloud default | Trust + ownership | Yes |
| Raw-input retention for re-derivation | §16.4, this round | Yes (new) |

### 17.2 Policies (legitimate to change with product direction; now changed)

| Old policy | Why it arose | New policy |
| --- | --- | --- |
| Every AI interpretation is pre-reviewed | Early trust-building; no policy engine existed | Six-factor apply matrix (§5.2); review is one outcome, not the pipeline |
| Explicit import only, nothing automatic | Surveillance fears before the A/B line was drawn | Approved-scope auto-sync inside the three rails (scope · review-gate-for-interpretation · transparency) |
| Import Review screen gates all input | Only one input path existed | Apply confirm mode, only where the matrix demands |
| 잠정/확정/통합 shown to users | Internal model leaked to surfaces | Internal-only; surfaces speak plain language |

### 17.3 Implementation choices (came from the old architecture, not from principle)

| Choice | Why it arose | Verdict |
| --- | --- | --- |
| AI conversation = session spine | 2026-05 session-centric redesign needed an anchor | Superseded by the record ledger (§1) |
| A Source must belong to a Session | Only sessions existed as containers | Removed: `Source` + `SourceLink` are session-free |
| Evidence Hub as a destination | Evidence-as-object thinking | Deprecated (§9) |
| Project Memory as the final aggregation layer | Memory was the only output | Replaced by ledger → aggregate → distill |
| Session schema at the center of SQLite | First persistence milestone | Kernel tables become the center; session tables feed adapters |
| `.mori` v0 as the exchange format | Shaped by what existed (sessions + accepted memory) | v1 workspace package (§11) |

### 17.4 Obsolete (high removal likelihood)

Memory hub + consolidation review screens; evidence-centric user
vocabulary; the mixed 연동 screen; treating the session-centric data flow
as the universal model. Each follows the §21 removal criteria, not an
immediate delete.

## 18. Target vs transition architecture

**Target architecture** (§1-§8, §10.3 end state, §11): designed as if no
legacy existed. **Transition architecture** (§9 verdicts, §12 migration):
adapters over existing tables, read-compat layers, converters, dual-run
windows, feature flags, palette-reachable deprecated screens, the v0
import shim.

The hard rule: **transition concepts never leak into the target.** The
`Record` kernel must not depend on `Session`; adapters convert sessions
into `agent-session` records, never the reverse; no kernel field exists
solely to satisfy a legacy table or test. Every transition artifact
carries an explicit removal condition (§21) at the moment it is created,
so temporary things cannot quietly become permanent.

## 19. Risk treatment policy

Risk is a design input, not a veto. "위험하다 / 복잡하다 / 되돌리기
어렵다" alone never shrinks a direction. For a promising-but-risky
capability (example: two-way Markdown editing), first design the solution
space: ownership model, change detection, conflict representation,
revisions, diff, merge, source of truth, recovery. Then judge by: user
value · long-term product fit · technical solvability · data-loss
potential · reversibility · migration cost · long-term debt ·
recoverability on failure. And symmetrically: "the old way is safer" is
itself a risk claim to evaluate, because an old way that pins the product
to the wrong center is the more expensive failure. Where §10.3 stages
two-way editing, that is a sequencing decision under this policy, not a
refusal; stage 2 is committed, not hypothetical.

## 20. Test and documentation migration

Tests encode doctrine. When doctrine changes: tests that verify old
product concepts (mandatory Import Review for all input, session-spine
invariants, evidence-hub flows) are rewritten or deleted **together with
the code they guard**; a new feature is never distorted to keep a legacy
test green. Kernel logic ships with colocated tests from day one
(existing rule, unchanged). Documentation: every doc that conflicts with
the new doctrine gets exactly one status, **rewritten** (brought to the
new model) / **historical** (kept as record, banner says so) /
**superseded** (banner + pointer to the replacement) / **deleted** (adds
nothing). No doc may remain ambiguously canonical; a future agent must
not be able to cite an old doc against the new center in good faith.

## 21. Legacy removal criteria

A deprecated screen, table, adapter, or term is actually removed when all
hold:

1. Its user jobs are demonstrably served by the new surfaces (per-surface
   checklist, §8.3 style).
2. Its data has migrated losslessly and the converter is idempotent,
   verified against real desktop data with observable diagnostics.
3. No code path writes to it anymore.
4. One full validation cycle has passed with the new path as the default.
5. The removal lands as a normal reviewed commit with migration notes.

Palette-reachability is a transition state with an expiry condition, not a
retirement home. (This operationalizes the revised retire-don't-delete
rule: retire is a migration tactic; removal is the intended end state
once the criteria hold.)

## 22. Capture input model (2026-07-14)

The user asked whether Mori should make people pick an input format first
(a Q&A form, a workout form) or just detect everything. The answer, and the
built direction, is a hybrid: **free input by default, structure on save,
optional templates where structure earns its place.**

Two axes, never conflated (they were merged on the legacy 연동 card grid):

- **Capture method** (how a trace arrives): direct text, paste, URL, file,
  voice, connected service, agent session. This is `CaptureInput.kind`.
- **Result schema** (what it becomes): activity, note, qa, meeting, workout,
  study, decision, comparison, reflection, user-defined. This is the
  record's `schemaId`.

Rules that follow:

1. **The default is one free field + auto-detect.** The user types or pastes
   anything; the proposer classifies; the raw source is preserved; the apply
   policy decides auto / provisional / confirm. No format is chosen up front.
   (Shipped: the 오늘 quick-capture.)
2. **Optional templates, never mandatory.** A "직접 선택" affordance and a
   "최근 형식" shortcut let a power user jump straight into a structured entry
   for schemas where structure pays off (workout, meeting, qa, comparison).
   Default stays 자동 감지. (Planned slice.)
3. **One input may yield multiple records.** "회사에서 저장 구조 검토했고
   퇴근하고 러닝 15분" is a work activity plus a workout in two contexts. The
   proposer returns `RecordProposal[]` and the pipeline persists all of them,
   so the model supports this today. The **deterministic pilot stays
   conservative** (it will not split on fragile heuristics like commas, which
   would wrongly split "러닝 10분, 팔굽혀펴기 5개 3세트"); robust multi-record
   splitting is an LLM-proposer capability. Honest over eager.
4. **AI Q&A is detected, not form-gated.** Pasting a 사용자:/AI: dialog is the
   default path (auto-split into turns); a structured question/answer entry is
   an optional mode for partial capture or multi-model comparison, not the
   requirement. (Shipping: dialog detection → the `qa` schema.)
5. **Detection is shown and correctable.** Mori surfaces what it understood
   (types + counts) and lets the user re-type; a repeated correction becomes a
   personalization rule (§7). Never a silent miscategorisation.
6. **연동 is connection management; capture is the inbox / global +.** The
   connections surface manages what is connected and its sync scope; everyday
   entry lives in the quick-capture field and the inbox, not behind a source
   card. (§8 IA; the 연동 → 설정 move is the K2-era transition.)

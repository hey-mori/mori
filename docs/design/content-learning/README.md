# Content Learning · canonical direction (YouTube first)

Status: **approved direction candidate, 2026-07-15 (C0).** Product
definition, current-state audit, policy research, architecture, and
staging for the content-learning capability, YouTube as the first
source. Written by the planning session; implementation belongs to an
implementing session, which should create `worklog.md` beside this file
(record-workspace convention) before its first slice.

Supersedes nothing; it elaborates what
[`../mori-personal-context-workspace-direction.md`](../mori-personal-context-workspace-direction.md)
item 12 staged (paste-transcript MVP → whisper → own-channel OAuth →
URL auto-extraction as experiment) and what the architecture doc
scenario 6 (YouTube 학습) promised. Companion:
[`../mori-context-workspace-architecture.md`](../mori-context-workspace-architecture.md)
(kernel, §4 pipeline, §5.2 apply matrix),
[`../workflow-first-direction.md`](../workflow-first-direction.md)
(priority context).

## 1. Product definition

Content learning is not a summarizer. It is the pipeline that lets a
user bring long-form content (a YouTube video first; later podcasts,
lectures, local media, documents) into Mori so that:

- the **source and its time structure are preserved** (video pointer,
  transcript with timestamps, per retention policy),
- what the speaker **actually said** stays distinguishable from what AI
  **inferred** and from what the **user wrote**,
- the user's learning becomes **records**: activity (분석함), knowledge,
  insight, question, task, each carrying provenance back to the exact
  time span in the source,
- and only what the user (or the apply policy) chooses becomes durable.

One sentence: 영상은 Source, 자막은 원본의 시간 구조, AI 분석은
Derivation, 사용자가 다시 쓸 것은 Record다.

## 2. Verdict on the source request (2026-07-15 외부 기획서)

The long external YouTube specification this direction consumes is
**largely doctrine-aligned** (Source/Derivation/Record separation,
three-time honesty, no auto-save-everything, schemas as data, manual
transcript first). Its deltas against Mori doctrine, corrected here:

- Implementation staging is re-based (§8): its Y1 remains the first
  vertical slice, but screens ride the existing composer/기록/inspector
  surfaces; no dedicated screen set, no fixed tab layout, per the copy
  diet and current visual doctrine.
- Its eight-layer analysis output is a **ceiling**, not the Y1 scope.
  Y1 ships 빠른 이해 + 주장(타임스탬프) + 배울 점 + 실행 항목; the rest
  are staged.
- "영상 전체/구간/강의/인터뷰..." input templates are deferred; the
  default is auto-detect, consistent with §22 of the architecture doc
  (free input, structure on save, optional templates later).
- Its Y5-Y7 (own-channel OAuth, playlists, external verification) stay
  in order but carry explicit entry conditions (§8); OAuth in
  particular touches the no-account-reading non-goal and needs its own
  decision when its turn comes.
- Its request to implement now is answered by this document plus the
  implementation-ready Y1 contract (§7); the planning session does not
  implement.

## 3. Current-state audit (2026-07-15, HEAD `35b0d7a`)

Code-verified; full trail in the audit agent findings, key rows here.

**Reusable as-is (Fact):**

- `KernelSource` carries `kind: url|file`, `locator`, retained
  `rawBody`, `contentHash`, `publishedAt`, `retention`
  (`src/lib/record-kernel/kernelTypes.ts:168-193`): the video pointer +
  pasted-caption storage substrate exists.
- `source-document` schema (url/author/publishedAt, layer source)
  (`systemSchemas.ts:109-121`), plus `study-session`, `knowledge`,
  `insight`, `qa`, `task`, `activity` schemas for the output records.
- Capture pipeline handles `CaptureInput.kind: "url"` end-to-end with
  raw retention (`capturePipeline.ts:124-130`); the six-factor apply
  matrix already expresses scenario 6's "배울 점 provisional, 실행 항목
  confirm".
- `SourceLink.locator` is **designed** for timestamp ranges
  (`kernelTypes.ts:195-204`, architecture doc §3.1) but has no producer
  yet.
- Long-content resilience exists in the Ollama provider: chunking,
  per-chunk failure tolerance, merge + dedup, JSON-truncation handling
  (`src/lib/analysis/ollamaProvider.ts:35-57,403-429`).
- Relation types cover the needed edges: `derived-from`, `references`,
  `part-of` (inverse of contains), `supports`
  (`kernelTypes.ts:147-155`).

**Must build (Gap):**

- A **timestamped transcript segment model**: nothing anywhere carries
  start/end times (`normalizeAiTranscript.ts:208-209`; no segment
  property type).
- **Caption parsing**: no SRT/VTT/timestamped-text parser exists.
- **Transcript normalizer** (dedup auto-caption stutter, sentence
  restore) and a **semantic segmenter** over timed segments.
- URL **metadata fetch**: today URL capture is pointer-only, no fetch
  (`ruleBasedProposer.ts:382-401`).
- Media transcription (whisper/ffmpeg): zero code, staged Y2; media
  ingestion is a documented non-goal *today* and enters as text.
- OpenAI-compatible provider chunking (currently truncates,
  `analysisPlan.ts:36-40`) and cross-run partial caches.

**Conflicts to resolve (this doc resolves both):**

- Docs name the pilot schema `url-document`; code seeds
  `source-document`. **Resolution: `source-document` is canonical**; docs
  referring to `url-document` mean it (goal doc and architecture doc to
  be touched in a follow-up sweep, not silently).
- Architecture scenario 5 says "URL 입력 → 본문 fetch" while the
  canonical stance is no automatic fetch. **Resolution (§5): fetch is
  allowed as a user-triggered, per-paste act with disclosure; background
  or bulk fetch stays out.** Scenario 5 described the target, not
  today's code.

## 4. Policy research (checked 2026-07-15, live sources)

- The official Data API `captions.download` requires OAuth **as the
  video owner**; third-party videos return 403. There is **no official
  endpoint for third-party transcripts**, including auto-captions
  ([captions.download](https://developers.google.com/youtube/v3/docs/captions/download),
  [captions resource](https://developers.google.com/youtube/v3/docs/captions)).
- API clients must obtain user consent, limit storage, and offer
  deletion under the
  [developer policies](https://developers.google.com/youtube/terms/developer-policies)
  and [API ToS](https://developers.google.com/youtube/terms/api-services-terms-of-service).
- Unofficial transcript access (youtube-transcript-api, yt-dlp,
  innertube) reverse-engineers internal endpoints: no SLA, breakable,
  ToS-gray ([survey](https://outlierkit.com/resources/youtube-transcript-api/)).
- Basic metadata (title, channel, thumbnail) is available with **no key
  via the documented oEmbed endpoint**; duration and upload date are
  not in oEmbed and need the Data API (user-supplied key) or honest
  omission ([oEmbed status](https://apis.io/apis/youtube/youtube-oembed-api/)).

Consequences, encoded in the staging below: **manual caption paste is
not merely the safe first path; it is the only compliant default for
third-party videos.** Unofficial extraction, if ever, is an
experimental, off-by-default provider clearly labeled as such and never
the sole route of a core feature. Own-channel OAuth is the only
official full-caption path and stays a late, separately-decided stage.

## 5. Architecture

### 5.1 Two layers, kernel-native

```text
YouTube Adapter          (url parse, video id, oEmbed metadata,
                          caption-paste hints; later: caption files,
                          owned-media transcription, own-channel OAuth)
        ↓ normalized ContentSource + TranscriptSegments
Content Learning Core    (normalizer, segmenter, analysis pipeline,
                          record proposal builder; source-agnostic)
        ↓ existing seams
Capture pipeline → apply policy → kernel records / revisions / FTS
```

No YouTube type leaks below the adapter. Podcast/local-media/document
adapters later produce the same normalized shape.

### 5.2 Data model (additive, no new store)

- **Video** = one `KernelSource` (`kind: url`, locator = canonical
  watch URL) + one `source-document` record (title/channel/publishedAt
  in properties). Raw pasted captions live in a second `KernelSource`
  (`kind: file` or `paste`) with `rawBody` retained: original captions
  are never overwritten by cleaned text (재분석 reads raw, §16.4).
- **TranscriptSegments** = a new kernel object collection
  (`kernel_objects` pattern) keyed to the caption Source: ordered rows
  of `{start?, end?, speaker?, text, confidence?, auto?}`. Times are
  optional so timestamp-less pastes stay first-class.
- **Segment citation** = `SourceLink.locator` gets its first producer
  with a fixed format: `t=<startSec>-<endSec>` (single point:
  `t=<sec>`). Every extracted claim/lesson links `derived-from` its
  Derivation and cites segments through SourceLinks; a lesson without a
  matching segment is marked 직접 근거 없음 (inferred), never silently
  blended.
- **Outputs** are existing schemas: `activity` (영상 분석함),
  `knowledge`, `insight`, `task`, `question` via `note`/`qa` initially
  (a standalone `question` schema is a data change if wanted),
  `study-session` for deliberate study passes. All flow through the
  apply matrix: knowledge/insight provisional, task confirm, activity
  auto, exactly scenario 6's grading.

### 5.3 Time honesty

Mapping to the three-time model: `publishedAt` = the video's own date
(`sourceCreatedAt`); the analysis `activity` record's `occurredStart` =
when the user ran the analysis (user-provided/capture-fallback); actual
watch date = **unknown unless the user says so** (`timeBasis: unknown`
stays first-class; never claim 시청일 from 분석일 or upload date).

### 5.4 Fetch policy (resolves the scenario-5 conflict)

A single, user-triggered metadata fetch (oEmbed) when the user pastes a
YouTube URL is permitted: it is a per-act, disclosed network request for
a URL the user just provided, consistent with the target capture model's
"URL fetch" channel and the three rails. It must degrade gracefully
offline (pointer-only capture still works), be visibly labeled (외부
요청), and never grow into background or bulk fetching. Page-body
fetching for general URLs remains a separate, future decision.

### 5.5 Retention modes

Map the requested ephemeral/temporary/persistent modes onto existing
machinery rather than new stores: an un-saved analysis is a composer
state that never persists (existing behavior); "keep the source, drop
the analysis" = Source retained + Derivation results discarded
(re-derivable from raw captions); durable records exist only through
the apply path. A TTL'd "최근 분석" cache is an optional later
convenience, not Y1.

## 6. What Y1 explicitly is not

No auto transcript extraction, no whisper, no playlists, no comparison,
no language-learning pack, no external verification, no dedicated
screens beyond the composer + inspector + one result presentation, no
per-video templates, no new DB. And no shrinking either: Y1 is judged
by whether claims carry working timestamps back into the video, not by
summary quality.

## 7. Y1 contract (implementation-ready)

```text
YouTube URL 붙여넣기 (composer)
→ video detect (id parse; url forms: watch/youtu.be/shorts/live/t=)
→ oEmbed metadata (title/channel/thumbnail; offline → pointer-only)
→ 자막 붙여넣기 안내 (탭 구분: 타임스탬프 있음/없음 자동 감지)
→ normalize (stutter dedup, line merge) + segment (timed or semantic)
→ analysis via existing engine seam (deterministic floor: chapters +
  claim candidates from discourse markers; LLM providers: chunked
  per-segment-group analysis, merged)
→ proposals: activity(분석) + knowledge/insight (provisional)
  + task (confirm), each with t=... SourceLinks
→ 기록 review flow (existing candidate cards) → records
→ 캘린더/프로젝트에 표시; 검색 도달은 S1 (search wiring) 이후
```

Failure UX minimums: invalid/private/deleted URL states, no-caption
guidance (붙여넣기 / 파일 / 구간 메모), duplicate-URL detection via
Source contentHash/locator, partial-analysis kept on engine failure.

Test floor: video-id parsing across URL forms; timestamped and
timestamp-less paste; normalizer idempotence; segment boundaries never
split mid-sentence; direct-claim vs inferred marking; raw caption
immutability across 재분석 (revision, not overwrite); no durable write
without apply; k1/k2 regression green.

## 8. Staging (rebased)

| Stage | Scope | Entry condition |
| --- | --- | --- |
| C0 | This direction + audit | done |
| Y1 | Manual-paste vertical slice (§7) | an implementing session picks it up; does not preempt S1-S3 of [`../search-and-session-unification-audit.md`](../search-and-session-unification-audit.md) |
| Y2 | Caption files (SRT/VTT) + owned-media whisper.cpp/ffmpeg (desktop) | Y1 used on real videos; media stays user-owned files only |
| Y3 | Deep learning outputs (concepts, 한계/검증 필요, user reactions) + study-session integration | Y1 output quality reviewed |
| Y4 | Language-learning pack (expression records with t= links) | user demand from real use |
| Y5 | Own-channel OAuth captions | explicit user decision (touches account non-goal) |
| Y6 | Playlists / multi-video comparison | Y3 shipped |
| Y7 | External verification links | verification Source model exercised |
| YX | Unofficial public-caption provider | experimental flag only, never default; separate risk decision |

Priority note: content learning strengthens the **capture** side, which
is already Mori's strongest pillar. It must not displace the Reuse
completion order (search wiring S1, session unification S2-S3); it can
proceed in parallel because it rides existing seams and touches none of
the same files.

## 9. Open decisions

1. `question` as a standalone schema vs `note` tagging in Y1
   (recommend: defer, use note + topic).
2. Whether the analysis `activity` record auto-applies (recommend: yes,
   it is a new, reversible, non-sensitive record; matches the matrix).
3. Where the Y1 result presentation lives: inspector extension vs a
   record-detail section (recommend: record detail of the
   source-document, progressive disclosure, no new screen).
4. Data API key as an optional user setting for duration/upload date in
   Y1 (recommend: omit in Y1; oEmbed fields only, honest absence).

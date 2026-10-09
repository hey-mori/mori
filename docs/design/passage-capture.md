# Passage capture and evidence retention

Status: implemented 2026-10-09 (capture #193, provenance #196, archive #198, retention view §5d); verified in isolated
runtimes against real and synthetic transcripts, not yet by the operator or in production.
Governing architecture: [`mori-context-workspace-architecture.md`](mori-context-workspace-architecture.md)
(Source / Record / SourceLink / Revision). This document does not add a store, an index or
a review queue; it routes one more kind of input through the ones that exist.

## 1. Problem

Mori can find a past decision inside an agent transcript and open the exact passage. What
the user then wants is to keep it, and today they can only:

- retype it into a note, losing the link to where it came from;
- record the whole session as an activity, keeping far more than the passage; or
- leave it in the transcript, which the agent deletes after 30 days by default
  (Claude Code `cleanupPeriodDays`; see the source-risk evidence for this machine).

The effort being removed: copying text out of a transcript, writing down where it came from,
and finding both again months later, after the transcript itself is gone.

## 2. Evidence states

Four states, never collapsed into one flag:

| State | What Mori holds | Survives source deletion | Search reaches it through |
| - | - | - | - |
| External source reference | where to read it (agent, file, record position) | no | transcript search, while the file exists |
| Retained excerpt (저장한 구절) | the exact visible text the user saved, with its origin | yes | record search (the record and its source excerpt) |
| Retained source archive (보관한 원본) | a user-chosen copy of a whole session | yes | transcript search and the viewer, reading the copy (§5c) |
| Kept historical import (이전에 가져온 기록) | the parsed events of an earlier open | yes, as it was then | session view; may be partial |

A retained excerpt is not the conversation; a kept import is not proof the full source was
preserved; a source reference is not a promise that the source will exist.

## 3. Trust model

- **Source fact**: "this message, at this time, in this session, said this text." The
  excerpt is stored verbatim from the viewer's visible-text projection and is never edited.
- **Interpretation**: the record's title, type and fields (decision, rationale, next
  action). Proposed from the excerpt, edited and confirmed by the user before it exists.
- **Not claimed**: that the decision was implemented, the task is still open, or the
  statement is true of the world. A historical agent reply is evidence of the reply.
- **Verification**: "원본 확인됨" only means the original file still exists and the stored
  position still holds the same text; it says nothing about external reality.

## 4. Journeys

1. **Capture a decision.** Search "Candidate B" → open the passage → 기록으로 남기기 on that
   message (or on a text selection inside it) → preview shows the exact excerpt, a record
   type (노트 by default; the user picks 결정), a title and body prefilled from the excerpt,
   and the project → the user edits → 저장 → a record exists, linked to a retained excerpt
   source.
2. **Capture an unresolved action.** Same flow from a latest reply opened in 현재 상황,
   type 할 일. The record is an open task the user created; Mori does not claim it is still
   outstanding upstream.
3. **Capture an explanation.** Same flow, type 지식 or 노트.
4. **Open it later.** 기록 search finds it by title, body or excerpt text; the record shows
   its excerpt with agent, message time and capture time.
5. **Open the original.** From the record, 원본 열기 resolves the session, re-reads the
   transcript around the stored position, verifies the text, and opens the passage. If the
   text no longer matches, it says the original changed instead of jumping elsewhere.
6. **After the original is deleted.** The record and its excerpt are intact; 원본 열기 says
   the original is gone; nothing claims the conversation around it was preserved.
7. **Preserve a whole session.** 원본 보관 in the session bar keeps a point-in-time copy (§5c).
8. **See what is retained.** The preview states that the excerpt is stored in Mori and can
   outlive the transcript; the record shows 저장한 구절 for that source.

## 5. Write timing

- Search, navigation, opening the preview: no durable write.
- 저장 in the preview: one commit that writes the retained-excerpt source, the record (status
  active, actor user), the origin SourceLink and the create revision.
- Cancel: nothing written, nothing retained.
- Saving the same passage again: the existing record is offered instead of a duplicate.

## 5a. Storage and identity (implemented)

- **Source** (`KernelSource`, kind `agent-session`, retention `retained`, or `redacted`
  when the user hid a likely secret): `rawBody` is the excerpt; `contentHash` is its
  SHA-256; `publishedAt` is the message's own timestamp; `locator` is
  `mori:session/<sessionId>#<recordStart>:<anchor>:<from>-<to>`, which carries no file path
  and is the key that a second save of the same passage is matched by.
- **Link** (`SourceLink`, role `origin`): `locator` is a versioned
  `mori-passage:v1:{…}` holding the Mori session id, the transcript fingerprint
  (`sourceId`, a hash of its first line: it detects a replaced file, not an edited one), the
  record's byte span and 64-byte anchor, the message id, the excerpt's character range inside
  the message, and the excerpt hash. When the user hid a likely secret, the kept text, the
  source hash and the locator hash are all of the redacted form (`redacted: true`); nothing
  derived from the hidden text is stored. `parsePassageLocator` rejects anything malformed.
- **Record**: origin `user`, status active, its create revision the user's;
  `occurredStart` is the message time (`source-exact`), or unknown when the message has none.
  Its body starts as the quoted excerpt so kernel search finds the words.
- **Position**: transcript windows now return each message's record span and anchor (the
  anchor the page cursor already uses). In real Claude Code transcripts a record's first 64
  bytes hold its `parentUuid`, not its own id or text, so the anchor alone proves little:
  re-opening a passage also requires the same message id and the excerpt hash at the saved
  range.
- No table, migration or index was added. Two repository reads (`listSources`,
  `listSourceLinks`) serve the duplicate check.

## 5b. Failure model

| Case | Behaviour |
| - | - |
| Message without a record position | no action offered |
| Tool call or tool output | no action offered |
| Message mixing text with a tool call | the whole message is refused; the user selects the part to keep |
| Message over 20,000 characters | refused until the user selects a part |
| Selection not wholly inside the message | refused (never widened to the whole message) |
| Phrase repeated in the message | kept at the occurrence the user selected (measured in the rendered text) |
| Likely secret | flagged; 가리기 on by default (retention `redacted`, body prefill redacted too) |
| Same passage saved again | the preview offers the existing record |
| Cancel | nothing written |
| Write fails midway | the excerpt source is written first, so what the user chose to keep is not lost |
| Original gone (or Mori no longer knows the session) | 원본 열기 says so; record and excerpt stay |
| Original replaced, rewritten, or another record now ends at that place | 원본 열기 says the original changed; nothing else is shown |
| Redacted passage no longer matches | "다시 확인하지 못했습니다": the redaction patterns may have changed, not only the original. Two originals that differ only inside a hidden span verify as equal (the hidden text was never kept) |
| 원본 열기 abandoned (record switched, page left) | the open in flight is dropped; nothing navigates later |

## 5c. Retained source archive (보관한 원본, implemented)

Why it exists next to saved passages: an excerpt keeps what the user knew to keep; the agent
deletes the whole transcript after 30 days by default (`cleanupPeriodDays`), and later
questions are about parts nobody saved. An external copy of `~/.claude/projects` keeps bytes
Mori cannot read or search; this keeps one chosen session readable and searchable in Mori.

- **Action**: 원본 보관 in the session bar, Claude Code transcripts only, never automatic. The
  dialog states the size, that the copy holds every message, tool call and output (secrets a
  tool printed included, and pasted or read images, which transcripts hold inline), what it
  does not hold (subagent transcripts, spilled tool-result files, anything said later), where it is stored (Mori's storage folder, not separately
  backed up), that it is not an agent-resumable session, and that removing it never touches
  the original.
- **Native**: `archive_claude_code_session` copies the transcript's complete records as they
  stand (a point-in-time snapshot; a partial last line is excluded) into
  `<storage>/archives/claude-code/<sha256>.jsonl`: a hidden partial file, synced, then renamed.
  Only files inside the agent's projects directory, never through a symlink; the same bytes
  reuse the existing file and a different file is never overwritten; a truncated source or a
  full disk removes the partial and fails. `remove_claude_code_archive` deletes one archive
  by its hash name. The window and search readers accept the archive directory as a second
  trusted root, so no other path becomes readable.
- **Kernel**: a `KernelSource` (kind `agent-session`, retention `retained`, no body, content
  hash = archive SHA-256) with locator `mori-archive:v1:{sessionId, fileName, bytes, sha256,
  sourceId}`; no absolute path. Changing the storage location moves the archives with the
  database, so the names still resolve. Removal keeps the
  source with retention `notCaptured` as history. The archive is not a record.
- **Reading**: only when the original is gone (deleted or moved, not merely unreadable) do opening the session, 원본 열기 on a
  saved passage, and project search read the kept copy instead, with the same fingerprint,
  anchor and excerpt checks (the copy shares the original's bytes and offsets). Every such view
  says 보관한 원본 · <date> 시점, paging included; project search coverage says 보관한 원본 for that
  session. A passage saved after the copy was taken reads as missing, not changed. Removal
  deletes the file only when no other kept source names the same (content-named) file.
  Partial files of interrupted copies older than an hour are swept on the next copy; an empty
  transcript and an archive folder inside the agent's directory are refused.
- **Integrity**: before a kept copy stands in for its original it is verified once per run:
  present, the recorded size, and hashing to its content name (it reads the file whole, so this
  happens when a copy is about to be read, never on render). A missing copy says 보관한 원본 파일이
  없습니다; a truncated or altered one says 보관한 원본이 손상되었습니다 and is not shown; a saved
  passage then reads as missing, and project search skips it.
- **A changed original with a kept copy**: the copy records the original's head fingerprint
  (`sourceId`, stable under appends). When the file at the path now has a different one,
  opening the session shows its kept copy instead (labelled as replacing a changed original),
  nothing from the other conversation is imported under the session's identity, and 원본 열기 on
  a saved passage reads the copy. Project search and opening at the latest reply still read the
  file at the path (a known limitation). The rule assumes the agent never rewrites a
  transcript's first line in place; no rewrite was observed, but it is not proven. A good
  verification is remembered for the run, so a copy altered after it was verified is not
  re-checked until the next launch.
- **Full reset**: 데이터 전체 초기화 deletes the archive files and partial copies once the
  kernel's records of them are cleared, and its confirmation names 보관한 원본. A file that
  cannot be removed is reported in settings as still in the archives folder. Pre-migration
  database snapshots in `backups/` are not touched by it (an open owner decision); they hold the
  kernel, passage text included, but never archive files, so a snapshot restored after a reset
  names archives that are gone and their sessions read as missing. 처음부터 시작 (the recovery
  reset of a broken database) deliberately keeps archives, since a backup restore beside it may
  name them; the next full reset removes any it left unnamed.
- **Not a backup**: an archive lives in Mori's storage folder, usually on the same disk as the
  original. Neither the pre-migration snapshots nor a `.mori` export include archive bytes, and
  a `.mori` export carries no 기록 records or saved passages either.

## 5d. Retention risk (정리될 수 있는 대화, implemented)

Mori may say that a source conversation may soon be removed; it never keeps one for the user.

- **Facts, kept apart**: whether the original is there (an existence check that never opens
  the file, only for the few sources near or past their estimate, while Home is showing or the
  dialog opens; "missing" only when the system says not found, any other error stays unknown;
  absence from discovery proves nothing, because a failed read lists nothing); when the cleanup
  *may* reach it (the file's last change plus `cleanupPeriodDays` from the managed settings file
  or the user's settings, else the documented default of 30; a value Mori cannot read as a
  period, such as 0, makes no estimate at all; project settings, MDM policy and
  `managed-settings.d` drop-ins are not read, and the docs do not say which age or when the
  sweep runs, so the copy says 정리 대상일 수 있음, never a date it will be deleted); and what Mori keeps (an archive, and whether it covers the transcript as it
  is now; saved passages that still back a live record; an earlier import). No score, no
  transcript read, no hashing.
- **Placement**: a quiet count in Home's status row (정리될 수 있는 대화 N개) only when a present
  source is within 7 days of its estimate, or past it, and no current archive holds it; nothing
  otherwise. The dialog behind it lists those conversations, most urgent first, with 열기 and 보관
  (the same keep dialog as the session bar, naming the conversation), and folds sources already
  gone under 원본을 찾을 수 없는 대화 N개 with what survives. The session bar chip adds 곧 정리될
  수 있음 / 정리 대상일 수 있음, or 이후 대화 있음 when the archive predates newer messages.
  An InfoHint holds the basis, the project-override caveat, and that an archive is not a backup.
- **Ignoring it** changes nothing: no archive, no notification, no background work.
- **Kept sessions outlive their original**: auto-import prunes placeholders whose transcript
  left discovery unless they were imported. A session with a kept archive or a saved passage is
  now kept too, so what was kept still opens from the session list after the agent removes the
  original. The kernel is read only for an unimported would-be-pruned session the cached kept
  set has not seen (or every 30 minutes), and a fallback kernel read skips pruning that pass.
  The session-bar chip estimates from the stored meta and does not check presence.

## 5e. Finding a record by its saved passage (implemented)

- 기록 search and the palette also match the saved passage text of each record, read from the
  passage sources already stored (the kept form: a redacted passage matches only its redacted
  text). A row found only that way says 저장한 구절에서 찾음 and shows the passage from the
  hit; the palette adds such records after its text-search results, up to the same 8.
- No field, index, export or copy is added. 기록 reads the passages only while a search is
  active (again when a record is added); the palette reads them once per open and a query waits
  for that read. Passage matching is a case-insensitive substring over NFC text with whitespace
  collapsed, like 기록's title and body matching. The palette's own results come from the text
  index, which matches whole words in any order; a passage needs the words in order, and a row
  whose body holds the query inside a longer word is shown without the passage label.
- A redacted passage's placeholder (such as `[REDACTED openai key]`) is part of its kept text,
  so it can match a search for those words; the hidden value never can.
- A passage whose source Mori no longer keeps (`notCaptured`) is not matched; a discarded or
  archived record is not shown.

## 5f. When the session on screen is a kept import (implemented)

- One quiet line under the session bar says the view is Mori's import, dated by its newest
  event, for two causes: the transcript is missing (원본 대화 파일을 찾을 수 없어 …), or it was
  read and no longer continues the import, replaced or rewritten at the same path (원본 대화
  파일이 바뀌어 …). The import is then kept as stored; a readable path never vouches for it.
  "Replaced" is known only to the open that read the file, so it is said until another open of
  a session, and after a restart only once the session is read again. Unreadable, too large or unavailable sources are neither cause.
- A session restored at startup was not read this run. When it becomes visible, Mori checks
  once that its transcript exists (no read); only if it is gone does the normal open run, which
  shows the kept archive or this line. No other session is checked.
- Reopening a session that shows the missing line reads it again, so a source that was only
  briefly unavailable recovers without a separate retry control.

## 6. Scope

Built (capture slice): single-message or in-message text selection from the transcript viewer;
record types from the existing schemas; retained excerpt as a kernel source; record search
through the record body (prefilled with the excerpt) and through the saved passage itself, so a
record whose body was rewritten is still found by the words it was saved from (§5e);
provenance on the record page (저장한 구절 with message and save time, and 원본 열기,
which re-reads to the stored record and requires its id and the excerpt hash there, marking
exactly the kept range).

Not built: multi-message excerpts (no workflow yet needs them); automatic or bulk capture;
AI summarisation of the excerpt; capture from imported timeline cards (they are a kept copy,
not the source); automatic or bulk archiving; changes to Claude Code settings.

## 7. Alternatives considered

- Manual note: works, but the link to the source is prose and dies with the transcript.
- Copying into a document: same, outside Mori's search and projects.
- External transcript backup (copy `~/.claude/projects`): preserves bytes, not meaning;
  no record, no project, no search in Mori; includes every secret the tools printed.
- `rg` / agent history: finds text while it exists; nothing to keep.
- Raising `cleanupPeriodDays`: keeps everything longer, for every session, as plaintext;
  a user setting, not Mori's to change.
- Existing Mori import: keeps the whole session's parsed events, not the chosen passage,
  and only for sessions that were opened.

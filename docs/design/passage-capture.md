# Passage capture and evidence retention

Status: designed 2026-10-09; implementation tracked in the PRs that cite this file.
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
| Retained source archive (보관한 원본) | a user-chosen copy of a whole session | yes | deferred (§9) |
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
   type (결정 by default for an assistant reply that states one, otherwise 노트), a title and
   body prefilled from the excerpt, and the project → the user edits → 저장 → a record exists,
   linked to a retained excerpt source.
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
7. **Preserve a whole session.** Deferred (§9).
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
  (`sourceId`), the record's byte span and 64-byte anchor, the message id, the excerpt's
  character range inside the message, and the excerpt hash. `parsePassageLocator` rejects
  anything malformed.
- **Record**: origin `user`, status active, its create revision the user's;
  `occurredStart` is the message time (`source-exact`), or unknown when the message has none.
  Its body starts as the quoted excerpt so kernel search finds the words.
- **Position**: transcript windows now return each message's record span and anchor (the
  anchor the page cursor already uses). The anchor covers only a record's first 64 bytes,
  so re-verifying a passage also compares the re-read text with the saved excerpt hash.
- No table, migration or index was added. Two repository reads (`listSources`,
  `listSourceLinks`) serve the duplicate check.

## 5b. Failure model

| Case | Behaviour |
| - | - |
| Message without a record position | refused with a reason; nothing written |
| Tool call or tool output | no action offered |
| Message over 20,000 characters | refused until the user selects a part |
| Selection outside the message | refused |
| Likely secret | flagged; 가리기 on by default (retention `redacted`, body prefill redacted too) |
| Same passage saved again | the preview offers the existing record |
| Cancel | nothing written |
| Write fails midway | the excerpt source is written first, so what the user chose to keep is not lost |
| Original changed / missing later | see the provenance cycle (원본 열기) |

## 6. Scope

Built: single-message or in-message text selection from the transcript viewer; record types
from the existing schemas; retained excerpt as a kernel source; provenance display with
original navigation and honest missing/changed states; record search over the excerpt.

Not built: multi-message excerpts (no workflow yet needs them); automatic or bulk capture;
AI summarisation of the excerpt; capture from imported timeline cards (they are a kept copy,
not the source); whole-session archives (§9); changes to Claude Code settings.

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

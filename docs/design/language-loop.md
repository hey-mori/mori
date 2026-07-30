# Mori Language Loop

Status: canonical for the language capability. Supersedes the scattered
"Understand (shipped)" notes in
[`mori-product-shell-ia.md`](mori-product-shell-ia.md) §4 and
[`mori-memory-roadmap.md`](mori-memory-roadmap.md) §2, which describe only the
first adapter and imply the feature is bounded by Mori's own screens.

## 1. What this is, and the conflict it resolves

Mori Language is **not** a translation panel for Mori's own screens. It is a
global language interface: the user meets English in a browser, a PDF, an
editor, a terminal, a messenger, and should be able to understand it and express
themselves without leaving that app.

The repository disagreed with itself about this. The IA and roadmap documents
described a selection-to-inspector feature inside the session timeline. The
language core added later
(`362f99e` → `543e960`) states the opposite in its own module headers: Mori's
internal selection is "ONE adapter, not the product". The core is both newer and
already built to the wider shape (no DOM types, no Tauri types, capture split
from action split from provider), so the wider reading wins and this document
records it.

Authority: this is a §16 conflict in
[`mori-context-workspace-architecture.md`](mori-context-workspace-architecture.md)
terms, resolved in favour of the newer, more general decision that the code
already embodies.

## 2. The adapter ladder

| # | Adapter | Status |
|---|---------|--------|
| 1 | Mori-internal DOM selection (`mori-selection`) | Shipped. The first adapter, not the boundary. |
| 2 | Direct input (`direct-input`) | Shipped. Also the universal fallback: it needs no permission and works on every platform. |
| 3 | OS selection (`os-selection`) + mini overlay | **This stage.** Windows via UI Automation. |
| 4 | Screen-region OCR (`screen-region`) | Out of v1. The type exists in the contract; there is no user path and it must not be reported as implemented. |
| 5 | Browser extension (`browser-selection`) | Out of v1. Adapter 3 already covers browsers through the accessibility tree. |

Every adapter produces the same `LanguageCaptureRequest` and runs through the
same action, provider, and consent path. Adding one must not reshape consumers.

## 3. Platform boundary

**Windows first, deliberately, against the launch order in
[`production-program.md`](../production-program.md).** That document sequences
W26 (Windows) after the macOS launch, but `CLAUDE.md` marks it
"to-be-re-baselined; do not sequence new work from it", and two things outrank
it here:

- The language core's own module headers already name "the Windows mini overlay"
  and UI Automation as the intended next adapter. That is the most recent
  written decision on this specific feature.
- A native accessibility integration is only worth what its verification is
  worth. The development machine is Windows, so the Windows path can be proven
  against a live desktop, and the macOS path could only be shipped unverified.

macOS is a follow-up adapter behind the same seam: `capture.rs` holds the
contract and every product rule, `capture_windows.rs` is one implementation, and
`commands.rs` selects between them with `cfg`. A macOS AX adapter adds a file.
Nothing in the shared domain or the UI knows which platform it is on; a build
with no adapter reports `Unsupported` and opens on direct input rather than
failing.

## 4. Capture v1 · the order of operations

The global chord (`CmdOrCtrl+Shift+E`) is the entire trigger surface. There is
no watcher, no polling, and no UI Automation event subscription anywhere in the
crate: without the keypress, Mori never looks at a selection.

1. Read the selection from the focused app through UI Automation
   (`GetFocusedElement` → Text pattern → `GetSelection`).
2. Attach only observed context: executable name, window title, cursor anchor.
   Every field is optional; an unread field is `None`, never a guess.
3. If no text came back, offer the explicit copy-on-invoke fallback. It is never
   automatic, because synthesising Ctrl+C into whatever is focused is strictly
   more invasive than reading a selection.
4. The fallback re-checks secure input immediately before the keystroke (focus
   can move between the capture and the user pressing the button), saves the
   user's clipboard, and restores it afterwards.
5. The result reports `clipboard-on-invoke`, so that path is never silent.
6. No text at all opens the direct-input composer, not an error.
7. Secure input blocks every path including the fallback.
8. The 2 000-character cap is applied natively, so an accidental select-all never
   crosses the IPC boundary.

### Provider behaviour, measured

Verified on this machine, with the probe in `capture_windows.rs`:

| Provider | Cold read | Notes |
|----------|-----------|-------|
| WPF text control | full text read | control type `Edit`, exact character count |
| Chromium / Electron | **nothing, until woken** | Chrome, VS Code, Slack, Claude Code |
| Win32 `EDIT` (WinForms, Notepad-class) | **no Text pattern at all** | falls to the clipboard path |

**The Chromium case is the important one**, because browsers are the primary
place someone meets English. Chromium builds no accessibility tree until it
believes an assistive client is present, so a cold `GetFocusedElement` returns a
stub with no Text pattern. This is not a failed read; the tree does not exist
yet. The documented trigger is a `WM_GETOBJECT` for `OBJID_CLIENT`, which Mori
now sends **only after an empty read**, then retries once. Measured on a live
Chrome window: `NoTextPattern` before, `PatternWithoutSelection` on a `Document`
control after, meaning `GetSelection` now runs against the real document.

The Win32 gap is why the clipboard fallback exists rather than being a defensive
nicety.

## 5. The overlay

A borderless, always-on-top second webview window on the same bundle, selected
by `?surface=language-overlay`. It is a **shell**: the body is
`LanguageResultView` and `LanguageComposer`, the same components the in-app
dialog renders.

Placement is a pure function (`overlay::place_overlay`), unit-tested for
below-right preference, edge flipping, negative-origin secondary monitors, and
an overlay larger than its screen.

Nothing survives a close: each capture bumps a session id that keys the body, so
reopening remounts rather than reusing, and a late clipboard retry is dropped if
its session is no longer current.

**Window ergonomics.** The header is a drag region (repeated on the title and
its icon, because the attribute applies only to the element carrying it, and
`core:window:allow-start-dragging` is required for any of it to work). The
window is resizable with a floor, and its size carries across invocations
because `present` never overrides the size the user left.

Position is a real conflict: opening next to the selection is right when reading
around a page, staying put is right when working through one document. Rather
than guess, the header offers a **pin**. Unpinned re-anchors each time; pinned
keeps the window exactly where it was dragged. The toggle's state is mirrored
from the native side so it cannot drift from the window's behaviour.

**다시 읽기** re-reads the selection without closing. It hides the window first,
because the overlay takes focus when it appears and reading the focused element
would otherwise read the overlay.

Preferences that outlive one capture (`languagePreferences.ts`): the language
pair and the last action. Deliberately not retention. There is no field a
selection could be stored in, and everything is validated on read.

**Not a seventh overlay stack.** Issue #17 records six divergent DOM overlay
implementations. The global overlay is a native window (genuinely a different
shell), and the in-app `LanguageDialog` was moved *onto* the shared pieces:
`--scrim` and `--z-overlay` tokens, `components/ui/focusTrap`, and focus
restoration on close.

## 6. Answer shape

The old contract was four fixed sections for everything. It is now chosen by
what was selected, while the user's **action** stays whatever they named:

| Selection | Sections |
|-----------|----------|
| Word | 뜻 · 품사 · 발음(IPA) · 문맥 · 연어 · 예문 · 구별 · 뉘앙스 |
| Phrase | 번역 · 뜻 · 직역과 차이 · 문형 · 표현 · 예문 · 뉘앙스 |
| Sentence | 번역 · 의도 · 구조 · 문법 · 표현 · 문형 · 뉘앙스 |
| Paragraph | 번역 · 뜻 · 표현 · 문법 |

Rules: detection proposes, it never changes the action. Optional sections are
omitted rather than padded. Sections the engine **invented** (예문, 대안, 연어,
구별, 문형) are flagged `synthetic` and labelled in the panel, and the engine is
told the same rule, so a made-up example is never read as a quotation from the
source.

The parser is generated from the section catalogue, tolerates markdown and bold
labels, accepts aliases, and still falls back to one raw section when a reply
ignores the contract entirely.

## 7. Consent

`languageConsent.ts` was policy with no caller. It now gates every provider
execution, before any prompt is built or sent.

- Local and fixture providers need no grant; nothing leaves the machine.
- Cloud and **unknown** locations require an explicit allow. Unknown is treated
  as external, never optimistically as safe.
- Secure input and blocked apps are checked **before** any grant and cannot be
  lifted by one.
- Grants never transfer between providers, and re-granting replaces rather than
  stacks.
- Storage is memory-first with a best-effort `localStorage` mirror. A write that
  fails, **or a store that does not exist**, yields `durable: false` and the UI
  must say the choice lasts only for this run. Issue #12 is the blocker on real
  durability.
- A grant never contains captured text.

## 8. Remember (L2) is not in this stage

Running an action creates nothing. `기억하기` needs durable storage, which is
issue #12. No partial save button ships before it; the follow-up issue carries
the model, provenance, trust rule, delete/undo/audit behaviour, and the rule
that saved expressions surface as a Memory **filter** rather than a Learn screen.

## 9. Out of scope for v1

OCR, a browser extension, a macOS adapter, per-app consent UI beyond the
overlay's "이 앱에서는 사용 안 함", and the `ask` action (it exists in the
capture type and has no user path; it must not be reported as implemented).

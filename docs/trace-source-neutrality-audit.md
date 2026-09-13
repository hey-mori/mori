# Trace Source Neutrality Audit

This note records the second pass after the initial AI Trace split. Browser was
future work when the audit was written. It is now an implemented Trace source
with a separate Chromium extension, Native Messaging transport, durable
evidence, current Context, and a paginated history read surface. Profile and
account identity, cross-device sync, page content capture, and semantic Browser
interpretation remain outside the implementation.

## Candidate Classification

Trace source:

- AI session tracking: existing discovery and import path, now under
  `src/lib/trace/sources/ai/` for discovery/detail loading and Trace projection.
- Terminal command evidence: existing `terminalShell` / `terminal` connector
  command events, now projectable through `src/lib/trace/sources/terminal/`.

Trace infrastructure / Mori-side adapters, not sources by themselves:

- Connector JSONL: transport and validation envelope for local opt-in captures.
- Background inbox watch: file-change detection and background analysis trigger.
- Live Follow: foreground polling and import orchestration.
- Timeline events: Mori domain/UI normalized events produced after import.
- Raw-source preservation: capture and provenance policy attached to sources.
- Auto-import registration: session-list visibility, stable Mori ids,
  localStorage reopen descriptors, and draft conversion.
- Agent-work import adaptation: conversion into Import Review candidates.

Mori application / Core / interpretation:

- Background analysis provider calls.
- Record-kernel provisional record writes.
- Stored session draft creation.
- Flow, Episode, Memory, recall, issues, decisions, and report generation.

## Terminal Source Boundary

The terminal source currently has no collector of its own. It only adapts
already-existing connector events whose connector id is `terminalShell` or
`terminal` and whose kind is `command_started` or `command_finished`.

`TraceSpan` is created only for `command_finished` events with an observed
positive duration. Duration-less command evidence remains a point event, because
Trace spans should represent observed intervals rather than inferred work
meaning.

## Browser Boundary

The Trace core stays free of browser-specific fields. Browser URL, tab, window,
runtime profile, and device observations live in Browser-local source metadata,
split between:

- Browser Context: current structural state.
- Browser Trace: temporal browser activity events.

The former Yusid ideas belong in that Mori Browser area, not in a separate
project boundary. Durable account identity, workspace interpretation, and
cross-device context remain future work rather than fields added to Trace core.

## Guard Rails

`src/lib/trace/traceArchitecture.test.ts` checks:

- Trace core does not import source, storage, connector, domain, capture,
  analysis, session, import, record, or memory layers.
- Trace sources do not import record, memory, capture, analysis, storage,
  session, import, or domain layers.
- New code imports Trace source modules instead of the legacy `src/lib/agents`
  compatibility path.

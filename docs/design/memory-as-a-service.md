# Memory as a service

Canonical model for what "memory" is in Mori and where it lives. Read this
before adding a memory surface or moving one.

## 1. The problem

Memory is currently experienced as a **page** (the Project Memory screen,
`MemoryView`). A page is a destination, and nobody visits a warehouse. The
durable value of memory is not produced *in* that screen; it is produced at
the **moments** a person needs reviewed understanding:

- resuming work ("what did we decide, what is unresolved, what do I carry
  forward"),
- working ("what did we decide about X", "what does this term mean"),
- looking back (timeline, reconstruction),
- handing off (resume prompt, report).

So the page feels ambiguous and unused because it is a warehouse, not a
workflow. This document fixes that without deleting anything.

## 2. The reframe

> **Memory is a service, not a destination.** The warehouse screen is one
> (read) consumer of that service. The product is the **capability layer**
> the service exposes; every surface, including non-UI ones, is a thin
> consumer of it.

Consequences:

- The warehouse screen **stays and keeps improving** as the "inspect
  everything" view (retire-don't-delete). It is reframed as an inspector,
  not the place work happens.
- Investment goes into the **capability layer** (clean, surface-agnostic,
  evidence-cited functions), not into the screen as such.
- A capability is only reusable if it is **consumable**: plain data in,
  plain data + citations + an honest `dataBasis` out, no UI / store
  coupling, external effects (LLM) behind an injected port. Mori already
  builds memory logic this way (pure `buildXyz` helpers); this document
  makes that the explicit public contract.

This is also the precondition for the originally-discussed MCP / "open Mori
as a tool" direction: memory trapped in React components cannot be exposed;
memory as a capability layer makes a read-only MCP server a thin adapter
over the same functions.

## 3. The capability façade

A single public surface, `src/lib/memory-api/`, is the documented "what
memory offers." Consumers import from here, not from
`project-memory/*` / `ask-mori/*` / `glossary/*` internals.

### 3.1 Canonical input

Every capability runs against one shaped input, the contract every consumer
produces (a UI hook, an MCP server, a notification producer):

```
type MemoryCapabilityInput = {
  acceptedMemories: StoredAcceptedProjectMemory[]; // durable, reviewed
  reviewActions: StoredMemoryReviewAction[];        // audit trail notes
  events: TimelineEvent[];                          // active-session evidence
  sources: SourceRef[];                             // active-session evidence
};
```

### 3.2 Operations (pure, or pure + injected LLM port)

| Operation | Wraps | Returns |
| --- | --- | --- |
| `memorySearch(input, query)` | `searchAcceptedMemories` + `searchProjectMemoryReferences` | accepted-memory hits + active-session references |
| `memoryAsk(input, question, {llm})` | `answerFromMemory` | cited answer, honest basis |
| `memoryGlossary(input, opts)` | `extractGlossaryTerms` | ranked terms with evidence |
| `memoryDefineTerm(term, {llm})` | `defineGlossaryTerm` | grounded definition, honest basis |

Future additions live here too (resume prompt, report, consolidation
state) as the surfaces that need them migrate to the façade.

### 3.3 Injection seams

- **LLM**: the `AskMoriLlm` port (`createAskMoriLlmFromSettings`). Absent →
  the operation degrades honestly (deterministic listing). No operation
  reaches the network on its own.
- **Data access**: a thin binding loads the input. In the app a React hook
  (`useMemoryService`) loads `acceptedMemories` / `reviewActions` from
  `AcceptedMemoryRepository`, reads the active session's `events` / `sources`
  and the Quick Pass settings, and returns `{ input, llm }`. An MCP server
  would build the same `MemoryCapabilityInput` from SQLite instead.

## 4. Consumer map

| Consumer | Today | Target |
| --- | --- | --- |
| Warehouse (Project Memory page) | renders search / ask / glossary / aggregates inline | stays, reframed as the inspector; cards consume the façade via `useMemoryService` (dedup) |
| Home command space (`MoriCommandSpaceHome`) | searches sessions / projects | add an "ask" path that calls `memoryAsk` (question from anywhere) |
| Command palette (⌘K) | navigation + actions | an "Ask Mori" command over the façade |
| Resume / continuation | `buildProjectMemoryResumePrompt` | inject accepted decisions / unresolved at the resume moment |
| Reports | `buildReportMarkdown` / `.mori` | unchanged; already a consumer |
| Notifications | companion + feed producers | a "review proposals" task instead of a page visit |
| MCP read-only server (future) | none | thin adapter over the façade ops |

## 5. Migration plan (small, retire-don't-delete)

1. **Façade + binding.** Add `src/lib/memory-api/` (operations + canonical
   input) and `useMemoryService`. Tested. No behavior change yet.
2. **Dedup the warehouse.** Refactor `AskMoriCard` / `QueryableMemoryCard` /
   `GlossaryCard` to consume the façade input from `useMemoryService`,
   removing the prop-drilling in `MemoryView`. Warehouse looks identical.
3. **Relocate "ask".** Add an Ask-Mori consumer outside the warehouse (⌘K
   command and/or a Home command-space path) over the same façade.
4. **Reframe the warehouse copy** as an inspector; fold the analysis-tools
   disclosure once "ask" lives elsewhere.
5. **Later**: resume-moment injection, notification review task, MCP adapter.

Each step ships independently and leaves Mori working.

## 6. Principles preserved

- **Evidence is source of truth.** Every operation stays evidence-cited and
  carries an honest `dataBasis`.
- **Review-before-apply.** The façade is read + propose only. It never makes
  memory durable; the consolidation gate is unchanged.
- **Local-first / no hidden capture.** No operation reaches the network on
  its own; the LLM is the user's opt-in local engine behind a port.
- **Retire-don't-delete.** The warehouse screen is reframed, never removed.

## 7. Non-goals

- Deleting the Project Memory page.
- A stateful in-memory cache / "memory daemon". The service is a set of pure
  operations over an input the consumer supplies.
- Embeddings / vector store as the substrate (unchanged non-goal).
- Shipping the MCP server in this work; only keeping the façade shaped so it
  is a thin adapter later.

## 8. Status

- Section 3 façade + `useMemoryService`: **designed (this doc)**, building
  next as step 1 of the migration plan.
- The underlying operations already exist and are tested (`ask-mori`,
  `glossary`, `project-memory/queryableMemory`).

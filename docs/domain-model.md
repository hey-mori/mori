# Domain Model

The TypeScript domain model lives in `src/domain/types.ts`.

Core entities:

- `Project`: long-lived work container
- `Session`: Start Mori to Stop Mori work unit
- `SourceRef`: captured/imported source evidence
- `TimelineEvent`: normalized unit on the Narrative Timeline
- `Issue`: unresolved or tracked problem
- `Decision`: important decision with rationale, alternatives, and impact
- `Relationship`: connection between events, issues, decisions, and artifacts
- `Artifact`: created output such as docs, code, reports, prompts, or packages
- `NextAction`: suggested continuation task
- `Summary`: generated session summary, resume prompt, and report content

Important unions:

- `TrustLevel`: `verified`, `observed`, `inferred`
- `RecordingMode`: `summary`, `full`, `ephemeral`
- `LlmProvider`: `ollama`, `lmStudio`, `openAiCompatible`, `cloudApi`
- `SourceKind`: `aiConversation`, `browser`, `file`, `terminal`, `manualNote`, `gitDiff`
- `RelationshipType`: `ledTo`, `caused`, `supported`, `contradicted`, `createdIssue`, `resolvedIssue`, `influencedDecision`, `producedArtifact`, `splitFrom`, `mergedInto`
- `IssueStatus`: `open`, `inProgress`, `resolved`, `watching`
- `Priority`: `high`, `medium`, `low`

Every timeline event includes session/project ids, timestamps, source references, linked issue/decision ids, relationship ids, trust level, confidence, creator, and user modification state.

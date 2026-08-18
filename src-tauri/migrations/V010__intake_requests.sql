-- Live intake index.
--
-- The derived index described in D8 of
-- `docs/design/live-project-intelligence-execution-plan.md`: one row per
-- observed agent request, reduced from the agent's own transcript.
--
-- Its own table rather than a `durable_documents` row, for the reason V009
-- records: a kind earns a table when it must be found by something other than
-- its owner. Intake is read per project, to build the project projection, and
-- per session, to derive transitions. A document per session would make the
-- project read a full scan and a deserialisation of every session.
--
-- Everything here is re-derivable. Each row carries the locator (path plus
-- byte offset) that D1 requires, so this table may be dropped and rebuilt from
-- the transcripts, and nothing in it is authored by the user. That is what
-- makes it evictable by class, unlike the durable documents beside it.
--
-- `row_json` holds the full reduced row; the indexed columns are copies, kept
-- as columns only because they are what the two reads filter and order by.

CREATE TABLE IF NOT EXISTS intake_requests (
  id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  project_path TEXT NOT NULL,
  started_at TEXT NOT NULL,
  row_json TEXT NOT NULL
);

-- The project projection reads every recent request for one project.
CREATE INDEX IF NOT EXISTS idx_intake_requests_project
  ON intake_requests(project_path, started_at DESC);

-- Signals compare a session's stored rows against the ones just observed.
CREATE INDEX IF NOT EXISTS idx_intake_requests_session
  ON intake_requests(session_key, started_at DESC);

/**
 * When a session was last active, for every surface that ranks or labels by
 * recency: the session lists, "최근 활동", and the continuation window.
 *
 * `startedAt` alone dates a long conversation by its first prompt, so a
 * transcript begun in September and written to today reads as September and
 * sorts below yesterday's one-turn sessions (#169). `savedAt` is the session's
 * last activity: an auto-imported session pins it to the transcript's last
 * write, and a manual one to its last content save (opening or renaming a
 * session does not restamp it). The later of the two is the honest recency.
 *
 * Placement by when work began (the calendar) keeps using `startedAt`.
 */
export function sessionLastActiveAt(session: { startedAt?: string; savedAt?: string }): string {
  const started = session.startedAt ?? "";
  const saved = session.savedAt ?? "";
  const startedMs = Date.parse(started);
  const savedMs = Date.parse(saved);
  if (Number.isNaN(savedMs)) return started || saved;
  if (Number.isNaN(startedMs)) return saved;
  return savedMs > startedMs ? saved : started;
}

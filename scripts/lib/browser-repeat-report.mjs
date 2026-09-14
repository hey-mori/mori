function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function distribution(values) {
  const measured = values.filter((value) => Number.isFinite(value));
  if (measured.length === 0) return null;
  return {
    count: measured.length,
    min: Math.min(...measured),
    median: median(measured),
    p95: percentile(measured, 0.95),
    max: Math.max(...measured),
  };
}

export function aggregateBrowserRepeatRuns({ matrix, reports, exitStatuses }) {
  const observationKinds = [
    "contextSnapshot",
    "navigationCommitted",
    "tabActivated",
    "historyStateUpdated",
  ];
  const hashes = ["mori", "nativeHost", "extension"];
  const firstObservations = Object.fromEntries(
    observationKinds.map((kind) => {
      const observations = reports.map((report) => report?.firstObservations?.[kind]);
      return [
        kind,
        {
          passes: observations.filter((observation) => observation?.pass).length,
          acknowledgementPasses: observations.filter((observation) => observation?.acknowledgement)
            .length,
          durablePasses: observations.filter((observation) => observation?.durableRow === true)
            .length,
          latencyMs: distribution(observations.map((observation) => observation?.latencyMs)),
        },
      ];
    }),
  );
  const failureCategories = {};
  for (const report of reports) {
    if (!report?.failureCategory) continue;
    failureCategories[report.failureCategory] =
      (failureCategories[report.failureCategory] ?? 0) + 1;
  }
  const artifactHashes = Object.fromEntries(
    hashes.map((name) => {
      const values = [
        ...new Set(reports.map((report) => report?.artifacts?.[name]?.sha256).filter(Boolean)),
      ];
      return [name, { consistent: values.length === 1, values }];
    }),
  );
  const successfulRuns = reports.filter(
    (report, index) =>
      exitStatuses[index] === 0 && report?.cleanup?.pass === true && report?.failures?.length === 0,
  ).length;
  const timelineValue = (report, stage) => report?.timeline?.[stage]?.elapsedMs;
  return {
    matrix,
    runs: reports.length,
    successfulRuns,
    failedRuns: reports.length - successfulRuns,
    cleanupPasses: reports.filter((report) => report?.cleanup?.pass).length,
    failureCategories,
    firstObservations,
    artifactHashes,
    lifecycleTimingMs: {
      moriReady: distribution(reports.map((report) => timelineValue(report, "mori_webview_ready"))),
      chromeReadyAfterSpawn: distribution(
        reports.map((report) => {
          const ready = timelineValue(report, "chrome_cdp_ready");
          const started = timelineValue(report, "chrome_spawn_started");
          return Number.isFinite(ready) && Number.isFinite(started) ? ready - started : null;
        }),
      ),
      captureEnabled: distribution(
        reports.map((report) => timelineValue(report, "capture_enabled")),
      ),
    },
    durationMs: distribution(reports.map((report) => report?.durationMs)),
  };
}

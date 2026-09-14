import assert from "node:assert/strict";
import test from "node:test";
import { aggregateBrowserRepeatRuns, distribution } from "./browser-repeat-report.mjs";

test("distribution reports nearest-rank timing boundaries", () => {
  assert.deepEqual(distribution([5, 1, 4, 2, 3]), {
    count: 5,
    min: 1,
    median: 3,
    p95: 5,
    max: 5,
  });
  assert.deepEqual(distribution([1, 3]), {
    count: 2,
    min: 1,
    median: 2,
    p95: 3,
    max: 3,
  });
  assert.equal(distribution([]), null);
});

test("aggregate keeps failed attempts and detects artifact drift", () => {
  const base = {
    failures: [],
    cleanup: { pass: true },
    durationMs: 100,
    artifacts: {
      mori: { sha256: "mori-a" },
      nativeHost: { sha256: "host-a" },
      extension: { sha256: "extension-a" },
    },
    firstObservations: {
      contextSnapshot: { pass: true, acknowledgement: true, durableRow: true, latencyMs: 10 },
      navigationCommitted: {
        pass: true,
        acknowledgement: true,
        durableRow: true,
        latencyMs: 20,
      },
      tabActivated: { pass: true, acknowledgement: true, durableRow: true, latencyMs: 30 },
      historyStateUpdated: {
        pass: true,
        acknowledgement: true,
        durableRow: true,
        latencyMs: 40,
      },
    },
  };
  const failed = structuredClone(base);
  failed.cleanup.pass = false;
  failed.failureCategory = "cleanup";
  failed.artifacts.mori.sha256 = "mori-b";

  const report = aggregateBrowserRepeatRuns({
    matrix: "fresh",
    reports: [base, failed],
    exitStatuses: [0, 1],
  });

  assert.equal(report.runs, 2);
  assert.equal(report.successfulRuns, 1);
  assert.equal(report.failedRuns, 1);
  assert.equal(report.failureCategories.cleanup, 1);
  assert.equal(report.firstObservations.navigationCommitted.passes, 2);
  assert.equal(report.artifactHashes.mori.consistent, false);
  assert.equal(report.artifactHashes.extension.consistent, true);
});

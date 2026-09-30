import assert from "node:assert/strict";
import test from "node:test";
import {
  localizeBrowserObservation,
  summarizeBrowserObservationProbes,
} from "./browser-observation-localization.mjs";

function classify(overrides = {}) {
  return localizeBrowserObservation({
    actionCommandSucceeded: true,
    routeReached: true,
    extensionRuntimeAvailable: true,
    extensionStateAvailable: true,
    recentEventFound: true,
    acknowledgementFresh: true,
    acknowledgementOk: true,
    acknowledgementCode: null,
    relayPending: false,
    durableWithinTimeout: true,
    durableLate: false,
    ...overrides,
  });
}

test("classifies the complete delivery path", () => {
  assert.deepEqual(classify(), {
    category: "delivered",
    blocking: false,
    evidenceDelivered: true,
    boundaries: {
      action: "confirmed",
      collector: "confirmed",
      send: "confirmed",
      acknowledgement: "confirmed",
      mori: "confirmed",
      durable: "confirmed",
      read: "confirmed",
    },
  });
});

test("stops on an acknowledgement contract violation", () => {
  const result = classify({ durableWithinTimeout: false });
  assert.equal(result.category, "ack_contract_violation");
  assert.equal(result.blocking, true);
  assert.equal(result.boundaries.acknowledgement, "confirmed");
  assert.equal(result.boundaries.durable, "missing");
});

test("separates collector, runtime, transport and late arrival failures", () => {
  assert.equal(
    classify({
      recentEventFound: false,
      acknowledgementFresh: false,
      acknowledgementOk: false,
      durableWithinTimeout: false,
    }).category,
    "collector_missing",
  );
  assert.equal(
    classify({
      extensionRuntimeAvailable: false,
      extensionStateAvailable: false,
      recentEventFound: false,
      acknowledgementFresh: false,
      acknowledgementOk: false,
      durableWithinTimeout: false,
    }).category,
    "extension_runtime_unavailable",
  );
  assert.equal(
    classify({
      acknowledgementOk: false,
      acknowledgementCode: "mori_timeout",
      durableWithinTimeout: false,
    }).category,
    "transport_mori_timeout",
  );
  assert.equal(
    classify({ durableWithinTimeout: false, durableLate: true }).category,
    "late_arrival",
  );
});

test("keeps durable evidence distinct from an unobserved acknowledgement", () => {
  const result = classify({
    extensionRuntimeAvailable: false,
    extensionStateAvailable: false,
    recentEventFound: false,
    acknowledgementFresh: false,
    acknowledgementOk: false,
  });
  assert.equal(result.category, "delivered_ack_unobserved");
  assert.equal(result.evidenceDelivered, true);
  assert.equal(result.boundaries.acknowledgement, "unknown");
});

test("summarizes classifications and boundary evidence", () => {
  const delivered = classify();
  const missing = classify({
    recentEventFound: false,
    acknowledgementFresh: false,
    acknowledgementOk: false,
    durableWithinTimeout: false,
  });
  assert.deepEqual(
    summarizeBrowserObservationProbes([{ localization: delivered }, { localization: missing }]),
    {
      observations: 2,
      delivered: 1,
      blocking: 0,
      categories: { delivered: 1, collector_missing: 1 },
      boundaries: {
        action: { confirmed: 2 },
        collector: { confirmed: 1, missing: 1 },
        send: { confirmed: 1, missing: 1 },
        acknowledgement: { confirmed: 1, missing: 1 },
        mori: { confirmed: 1, unknown: 1 },
        durable: { confirmed: 1, missing: 1 },
        read: { confirmed: 1, missing: 1 },
      },
    },
  );
});

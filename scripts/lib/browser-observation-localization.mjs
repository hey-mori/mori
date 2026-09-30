const CONFIRMED = "confirmed";
const MISSING = "missing";
const UNKNOWN = "unknown";

export function localizeBrowserObservation(input) {
  const action = input.actionCommandSucceeded && input.routeReached ? CONFIRMED : MISSING;
  const collector = input.extensionStateAvailable
    ? input.recentEventFound
      ? CONFIRMED
      : MISSING
    : UNKNOWN;
  const acknowledgement = input.acknowledgementFresh
    ? input.acknowledgementOk
      ? CONFIRMED
      : "error"
    : input.extensionStateAvailable
      ? MISSING
      : UNKNOWN;
  const send =
    input.acknowledgementFresh || input.relayPending
      ? CONFIRMED
      : collector === CONFIRMED
        ? UNKNOWN
        : collector;
  const mori =
    input.durableWithinTimeout || input.durableLate || input.acknowledgementFresh
      ? CONFIRMED
      : input.relayPending
        ? "pending"
        : UNKNOWN;
  const durable = input.durableWithinTimeout || input.durableLate ? CONFIRMED : MISSING;
  const read = durable;

  let category;
  let blocking = false;
  if (action !== CONFIRMED) {
    category = "action_not_completed";
  } else if (input.durableWithinTimeout) {
    if (acknowledgement === CONFIRMED) category = "delivered";
    else if (acknowledgement === "error") category = "durable_ack_error";
    else category = "delivered_ack_unobserved";
  } else if (input.durableLate) {
    category = "late_arrival";
  } else if (acknowledgement === CONFIRMED) {
    category = "ack_contract_violation";
    blocking = true;
  } else if (!input.extensionRuntimeAvailable) {
    category = "extension_runtime_unavailable";
  } else if (collector === MISSING) {
    category = "collector_missing";
  } else if (acknowledgement === "error") {
    category = input.acknowledgementCode
      ? `transport_${input.acknowledgementCode}`
      : "transport_error";
  } else if (input.relayPending) {
    category = "mori_relay_pending";
  } else if (collector === CONFIRMED) {
    category = "send_or_ack_unknown";
  } else {
    category = "unlocalized";
  }

  return {
    category,
    blocking,
    evidenceDelivered: durable === CONFIRMED,
    boundaries: { action, collector, send, acknowledgement, mori, durable, read },
  };
}

export function summarizeBrowserObservationProbes(records) {
  const categories = {};
  const boundaries = {};
  for (const record of records) {
    const localization = record?.localization;
    if (!localization) continue;
    categories[localization.category] = (categories[localization.category] ?? 0) + 1;
    for (const [boundary, status] of Object.entries(localization.boundaries)) {
      boundaries[boundary] ??= {};
      boundaries[boundary][status] = (boundaries[boundary][status] ?? 0) + 1;
    }
  }
  return {
    observations: records.length,
    delivered: records.filter((record) => record?.localization?.evidenceDelivered).length,
    blocking: records.filter((record) => record?.localization?.blocking).length,
    categories,
    boundaries,
  };
}

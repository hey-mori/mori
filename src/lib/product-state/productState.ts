/**
 * Mori product-state model — typed derivations over the shared label tables
 * in `productStateLabels.ts`.
 *
 * Components and pure helpers should import the `getProduct*` accessors and
 * the `productAvailabilityFrom*` mappers from here, never re-deriving a
 * label or a tone locally. The label / description / tone data lives in
 * `productStateLabels.ts`; this file adds:
 *
 *   - typed accessors (`getProductAvailabilityDisplay`, …)
 *   - convenience label / tone lookups
 *   - mappers that bridge the older `FeatureStatus` (`featureStatus.ts`) and
 *     `IntegrationStatus` (`sourceRegistry.ts`) taxonomies into the shared
 *     availability vocabulary, so adopting surfaces do not have to.
 */
import type { FeatureStatus } from "../../app/featureStatus";
import type { IntegrationStatus } from "../sources/sourceRegistry";
import {
  PRODUCT_AVAILABILITY_LABELS,
  PRODUCT_COMPANION_STATE_LABELS,
  PRODUCT_DATA_LABELS,
  PRODUCT_MEMORY_STATUS_LABELS,
  PRODUCT_RUNTIME_LABELS,
  type ProductAvailabilityState,
  type ProductCompanionState,
  type ProductDataState,
  type ProductMemoryStatusState,
  type ProductRuntimeState,
  type ProductStateDisplay,
  type ProductStateTone,
} from "./productStateLabels";

export type {
  ProductAvailabilityState,
  ProductCompanionState,
  ProductDataState,
  ProductMemoryStatusState,
  ProductRuntimeState,
  ProductStateDisplay,
  ProductStateTone,
} from "./productStateLabels";
export {
  PRODUCT_AVAILABILITY_LABELS,
  PRODUCT_COMPANION_STATE_LABELS,
  PRODUCT_DATA_LABELS,
  PRODUCT_MEMORY_STATUS_LABELS,
  PRODUCT_RUNTIME_LABELS,
} from "./productStateLabels";

// ───────────────────────────── Availability ─────────────────────────────

export function getProductAvailabilityDisplay(
  state: ProductAvailabilityState,
): ProductStateDisplay {
  return PRODUCT_AVAILABILITY_LABELS[state];
}

export function getProductAvailabilityLabel(
  state: ProductAvailabilityState,
): string {
  return PRODUCT_AVAILABILITY_LABELS[state].label;
}

export function getProductAvailabilityTone(
  state: ProductAvailabilityState,
): ProductStateTone {
  return PRODUCT_AVAILABILITY_LABELS[state].tone;
}

// ──────────────────────────── Runtime / storage ─────────────────────────

export function getProductRuntimeDisplay(
  state: ProductRuntimeState,
): ProductStateDisplay {
  return PRODUCT_RUNTIME_LABELS[state];
}

export function getProductRuntimeLabel(state: ProductRuntimeState): string {
  return PRODUCT_RUNTIME_LABELS[state].label;
}

export function getProductRuntimeTone(
  state: ProductRuntimeState,
): ProductStateTone {
  return PRODUCT_RUNTIME_LABELS[state].tone;
}

// ──────────────────────────── Data / provenance ─────────────────────────

export function getProductDataDisplay(
  state: ProductDataState,
): ProductStateDisplay {
  return PRODUCT_DATA_LABELS[state];
}

export function getProductDataLabel(state: ProductDataState): string {
  return PRODUCT_DATA_LABELS[state].label;
}

export function getProductDataTone(state: ProductDataState): ProductStateTone {
  return PRODUCT_DATA_LABELS[state].tone;
}

// ──────────────────────────── Memory lifecycle ──────────────────────────

export function getProductMemoryStatusDisplay(
  state: ProductMemoryStatusState,
): ProductStateDisplay {
  return PRODUCT_MEMORY_STATUS_LABELS[state];
}

export function getProductMemoryStatusLabel(
  state: ProductMemoryStatusState,
): string {
  return PRODUCT_MEMORY_STATUS_LABELS[state].label;
}

export function getProductMemoryStatusTone(
  state: ProductMemoryStatusState,
): ProductStateTone {
  return PRODUCT_MEMORY_STATUS_LABELS[state].tone;
}

// ─────────────────────────────── Companion ──────────────────────────────

export function getProductCompanionStateDisplay(
  state: ProductCompanionState,
): ProductStateDisplay {
  return PRODUCT_COMPANION_STATE_LABELS[state];
}

export function getProductCompanionStateLabel(
  state: ProductCompanionState,
): string {
  return PRODUCT_COMPANION_STATE_LABELS[state].label;
}

export function getProductCompanionStateTone(
  state: ProductCompanionState,
): ProductStateTone {
  return PRODUCT_COMPANION_STATE_LABELS[state].tone;
}

// ───────────────────────────────── Mappers ──────────────────────────────

/**
 * Bridge the `FeatureStatus` registry vocabulary (`featureStatus.ts`, also
 * used verbatim by the Settings `ProviderStatus`) into the shared
 * availability state. The two vocabularies line up one-to-one today; the
 * mapper exists so adopting surfaces never hard-code the relationship.
 */
export function productAvailabilityFromFeatureStatus(
  status: FeatureStatus,
): ProductAvailabilityState {
  switch (status) {
    case "implemented":
      return "available";
    case "partial":
      return "partial";
    case "planned":
      return "planned";
    case "unavailable":
      return "unavailable";
  }
}

/**
 * Bridge the source-registry `IntegrationStatus` vocabulary into the shared
 * availability state. The only divergence from `FeatureStatus` is
 * `mockOnly`, which maps to the explicit `demoOnly` availability state.
 */
export function productAvailabilityFromIntegrationStatus(
  status: IntegrationStatus,
): ProductAvailabilityState {
  switch (status) {
    case "implemented":
      return "available";
    case "partial":
      return "partial";
    case "planned":
      return "planned";
    case "mockOnly":
      return "demoOnly";
    case "unavailable":
      return "unavailable";
  }
}

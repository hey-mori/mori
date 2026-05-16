import { getProductRuntimeDisplay } from "../product-state/productState";
import type {
  ProductRuntimeState,
  ProductStateDisplay,
} from "../product-state/productStateLabels";

/**
 * Device & security model.
 *
 * Mori has no account backend, so there is no server holding sessions
 * and no fleet of devices to revoke. "Security" here is the honest
 * local-first boundary: the runtime the data lives in, and the fact
 * that remote session management stays planned because nothing is
 * stored server-side. This module never reports a remote session — the
 * count is structurally zero, not an empty list waiting to fill.
 */

export type DeviceSecuritySummary = {
  isDesktop: boolean;
  runtimeState: ProductRuntimeState;
  runtime: ProductStateDisplay;
  /** Structurally zero: Mori keeps no server-side sessions to enumerate. */
  remoteSessionCount: 0;
};

export function buildDeviceSecuritySummary(options: {
  isDesktop: boolean;
}): DeviceSecuritySummary {
  const runtimeState: ProductRuntimeState = options.isDesktop
    ? "desktopSQLite"
    : "browserLocalStorage";
  return {
    isDesktop: options.isDesktop,
    runtimeState,
    runtime: getProductRuntimeDisplay(runtimeState),
    remoteSessionCount: 0,
  };
}

/**
 * The local security boundary, stated as guarantees rather than
 * settings. Each line is something Mori's architecture enforces today,
 * not a toggle the user has to find.
 */
export const LOCAL_SECURITY_POINTS = [
  "데이터는 이 기기의 로컬 저장소에만 보관되며, 계정 백엔드로 전송되지 않습니다",
  "백그라운드 데몬이나 상시 모니터링 프로세스가 없습니다 — Mori는 실행 중일 때만 동작합니다",
  "캡처는 항상 명시적이며, 외부 데이터 접근은 커넥터별로 따로 승인합니다",
  "원본과 요약 데이터는 사용자가 언제든 직접 삭제할 수 있습니다",
];

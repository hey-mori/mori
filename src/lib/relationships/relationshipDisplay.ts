import type { RelationshipType, TrustLevel } from "../../domain/types";
import { describeConfidence as describeConfidenceShared, getTrustDisplay } from "../evidence/trust";

export type RelationshipDisplay = {
  label: string;
  tone: string;
  description: string;
};

const RELATIONSHIP_TABLE: Record<RelationshipType, RelationshipDisplay> = {
  ledTo: { label: "이어짐", tone: "blue", description: "이벤트가 다음으로 이어졌습니다." },
  caused: { label: "원인", tone: "red", description: "소스가 대상을 유발했습니다." },
  supported: { label: "뒷받침", tone: "green", description: "소스가 근거로 대상을 뒷받침했습니다." },
  contradicted: { label: "상충", tone: "orange", description: "소스가 대상과 상충했습니다." },
  createdIssue: { label: "이슈 생성", tone: "red", description: "이벤트에서 이슈가 발생했습니다." },
  resolvedIssue: { label: "이슈 해결", tone: "green", description: "이벤트가 이슈를 해결했습니다." },
  influencedDecision: { label: "결정에 영향", tone: "purple", description: "이벤트가 결정에 영향을 미쳤습니다." },
  producedArtifact: { label: "산출물 생성", tone: "blue", description: "이벤트가 산출물을 생성했습니다." },
  splitFrom: { label: "분리됨", tone: "gray", description: "이벤트가 다른 이벤트에서 분리되었습니다." },
  mergedInto: { label: "병합됨", tone: "gray", description: "이벤트가 다른 이벤트로 병합되었습니다." },
};

export function getRelationshipDisplay(type: RelationshipType): RelationshipDisplay {
  return RELATIONSHIP_TABLE[type] ?? { label: type, tone: "gray", description: "" };
}

export function describeRelationshipConfidence(confidence: number): { label: string; tone: string } {
  if (!Number.isFinite(confidence)) return { label: "—", tone: "gray" };
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return describeConfidenceShared(pct);
}

export function describeTrustLevel(trust: TrustLevel): { label: string; tone: string } {
  const display = getTrustDisplay(trust);
  return { label: display.label, tone: display.tone };
}

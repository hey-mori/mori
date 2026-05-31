import { Archive, FileText } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BaseSection } from "../../components/ui/BaseSection";
import type { StoredMoriPackageDraft } from "../../lib/storage/storageTypes";
import { formatDateTime } from "../../lib/formatting/time";

export function SavedReportsCard({
  packages,
  hasCurrentReportSurface,
  onOpenReports,
}: {
  packages: StoredMoriPackageDraft[];
  hasCurrentReportSurface: boolean;
  onOpenReports: () => void;
}) {
  return (
    <BaseSection
      className="memory-reports"
      ariaLabel="저장된 보고서"
      title="저장된 보고서 · .mori 패키지"
      hint={
        <>
          현재는 브라우저 draft에 저장된 .mori v0 JSON 패키지를 보여줍니다. 보고서 히스토리(저장된 Markdown / PDF)는
          <strong> 다음 마일스톤</strong>입니다.
        </>
      }
      actions={
        <Button
          icon={FileText}
          onClick={onOpenReports}
          disabled={!hasCurrentReportSurface}
          title={
            hasCurrentReportSurface
              ? "Reports 페이지를 엽니다."
              : "Reports 페이지는 다음 마일스톤에서 제공됩니다."
          }
        >
          Reports 열기
        </Button>
      }
    >
      {packages.length === 0 ? (
        <p className="memory-empty">아직 저장된 .mori 패키지가 없습니다. 보고서에서 내보내면 여기 표시됩니다.</p>
      ) : (
        <ul className="memory-reports-list">
          {packages.map((entry) => {
            const primary = entry.package.sessions.find(
              (session) => session.id === entry.package.manifest.primarySessionId,
            );
            const label = primary?.title ?? entry.package.projects[0]?.name ?? entry.package.manifest.packageId;
            const sessionCount = entry.package.sessions.length;
            return (
              <li key={entry.packageId}>
                <span className="memory-reports-icon">
                  <Archive size={14} aria-hidden="true" />
                </span>
                <div>
                  <strong title={label}>{label}</strong>
                  <span>
                    <Badge tone="purple">.mori v0</Badge>
                    <small>{sessionCount}개 세션 · {formatShort(entry.savedAt)}</small>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </BaseSection>
  );
}

function formatShort(iso: string): string {
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

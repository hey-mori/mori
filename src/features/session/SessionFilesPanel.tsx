import { useEffect, useMemo, useState } from "react";
import { Eye, FilePen, FilePlus, FileText, FolderOpen } from "lucide-react";

import type { FileChangeKind, SourceRef } from "../../domain/types";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import {
  commonAncestorDir,
  reconcileFileProvenance,
  rollUpFileTouches,
  summarizeFileProvenance,
  toResolutionMap,
  type FileLocationResolution,
  type ReconciledFileEntry,
} from "../../lib/file-provenance/fileProvenance";
import {
  isFileProvenanceBridgeAvailable,
  resolveFileLocations,
  revealPathInOs,
} from "../../lib/file-provenance/fileProvenanceBridge";

/**
 * "이 세션이 만진 파일" — the file provenance panel for Session 개요.
 *
 * Reads `SourceRef.fileTouches` (preserved from the agent's tool calls), rolls
 * it up per file, and on the desktop reconciles each path against the current
 * filesystem so a moved or deleted file is flagged and can be opened where it
 * actually is. Renders nothing when the session touched no files (e.g. the demo
 * session, or a transcript with no tool activity), so it never adds an empty
 * box to the overview.
 */
export function SessionFilesPanel({ sources }: { sources: SourceRef[] }) {
  const touches = useMemo(
    () => sources.flatMap((source) => source.fileTouches ?? []),
    [sources],
  );
  const entries = useMemo(() => rollUpFileTouches(touches), [touches]);
  const paths = useMemo(() => entries.map((entry) => entry.path), [entries]);
  // A stable join so the resolve effect only re-runs when the path set changes,
  // not on every render that rebuilds the array identity.
  const pathKey = paths.join("\n");
  const searchRoot = useMemo(() => commonAncestorDir(paths), [pathKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [resolutions, setResolutions] = useState<
    Record<string, FileLocationResolution>
  >({});

  useEffect(() => {
    if (!isFileProvenanceBridgeAvailable() || paths.length === 0) {
      setResolutions({});
      return;
    }
    let cancelled = false;
    resolveFileLocations(paths, searchRoot || undefined)
      .then((locations) => {
        if (!cancelled) setResolutions(toResolutionMap(locations));
      })
      .catch(() => {
        if (!cancelled) setResolutions({});
      });
    return () => {
      cancelled = true;
    };
  }, [pathKey, searchRoot]); // eslint-disable-line react-hooks/exhaustive-deps

  const reconciled = useMemo(
    () => reconcileFileProvenance(entries, resolutions),
    [entries, resolutions],
  );
  const summary = useMemo(() => summarizeFileProvenance(reconciled), [reconciled]);

  if (entries.length === 0) return null;

  const changed = reconciled.filter((entry) => entry.changeCount > 0);
  const readOnly = reconciled.filter((entry) => entry.changeCount === 0);

  return (
    <section className="session-files" aria-label="파일 활동">
      <header className="session-files-head">
        <h2>파일 활동</h2>
        <Badge tone="gray">{summary.fileCount}</Badge>
        <InfoHint>
          에이전트의 도구 호출 기록에서 추출한 파일입니다. 변경된 파일을 먼저
          보여주고, 현재 위치를 확인해 옮겨졌거나 사라진 파일을 표시합니다.
          오른쪽 버튼으로 파일 위치를 엽니다.
        </InfoHint>
        <span className="session-files-summary">
          변경 {summary.changedFileCount}
          {summary.movedFileCount > 0 ? ` · 이동 ${summary.movedFileCount}` : ""}
          {summary.missingFileCount > 0 ? ` · 유실 ${summary.missingFileCount}` : ""}
        </span>
      </header>

      <ul className="session-files-list">
        {changed.map((entry) => (
          <FileRow key={entry.path} entry={entry} />
        ))}
      </ul>

      {readOnly.length > 0 ? (
        <details className="session-files-readonly">
          <summary>읽기만 한 파일 {readOnly.length}개</summary>
          <ul className="session-files-list">
            {readOnly.map((entry) => (
              <FileRow key={entry.path} entry={entry} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function FileRow({ entry }: { entry: ReconciledFileEntry }) {
  const canReveal =
    isFileProvenanceBridgeAvailable() && entry.location.status !== "missing";
  const dir = directoryLabel(entry.path, entry.fileName);
  return (
    <li className={`session-file-row status-${entry.location.status}`}>
      <span
        className={`session-file-kind kind-${entry.primaryChangeKind}`}
        aria-hidden="true"
      >
        <KindIcon kind={entry.primaryChangeKind} />
      </span>
      <span className="session-file-name">
        <strong title={entry.path}>{entry.fileName}</strong>
        {dir ? <span className="session-file-dir">{dir}</span> : null}
      </span>
      <span className="session-file-counts">{countsLabel(entry)}</span>
      {entry.additions > 0 || entry.deletions > 0 ? (
        <span className="session-file-diff" title="추가 / 삭제된 줄">
          {entry.additions > 0 ? (
            <span className="session-file-add">+{entry.additions}</span>
          ) : null}
          {entry.deletions > 0 ? (
            <span className="session-file-del">-{entry.deletions}</span>
          ) : null}
        </span>
      ) : null}
      <LocationBadge entry={entry} />
      {canReveal ? (
        <Button
          variant="ghost"
          size="sm"
          icon={FolderOpen}
          title={entry.location.status === "moved" ? "옮겨진 위치 열기" : "위치 열기"}
          onClick={() => void revealPathInOs(entry.openPath)}
        />
      ) : null}
    </li>
  );
}

function LocationBadge({ entry }: { entry: ReconciledFileEntry }) {
  if (entry.location.status === "moved") return <Badge tone="orange">이동됨</Badge>;
  if (entry.location.status === "missing") return <Badge tone="red">유실</Badge>;
  return null;
}

function KindIcon({ kind }: { kind: FileChangeKind }) {
  if (kind === "wrote") return <FilePlus size={14} />;
  if (kind === "edited") return <FilePen size={14} />;
  if (kind === "read") return <Eye size={14} />;
  return <FileText size={14} />;
}

function countsLabel(entry: ReconciledFileEntry): string {
  const parts: string[] = [];
  if (entry.wrote > 0) parts.push(`생성 ${entry.wrote}`);
  if (entry.edited > 0) parts.push(`편집 ${entry.edited}`);
  if (entry.read > 0) parts.push(`읽기 ${entry.read}`);
  if (entry.touched > 0) parts.push(`기타 ${entry.touched}`);
  return parts.join(" · ");
}

/**
 * The directory the file lives in, shortened to its last two segments with a
 * leading ellipsis ("…/features/session") so a long absolute path stays calm
 * while keeping the part that orients the reader. The filename's `title`
 * attribute still carries the full path on hover.
 */
function directoryLabel(path: string, fileName: string): string {
  const dir = (path.endsWith(fileName) ? path.slice(0, path.length - fileName.length) : path)
    .replace(/[/\\]+$/, "");
  if (!dir) return "";
  const segments = dir.split(/[/\\]/).filter(Boolean);
  if (segments.length <= 2) return dir;
  return `…/${segments.slice(-2).join("/")}`;
}

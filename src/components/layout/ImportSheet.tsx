import { X } from "lucide-react";
import { useAppStore } from "../../app/store";
import { ImportPanel } from "../../features/import/ImportPanel";
import { useOverlayShell } from "../ui/useOverlayShell";

/**
 * The consumer `evidenceImportRequest` never had.
 *
 * 소스 and 연동 both show "가져오기" actions, and both call
 * `requestEvidenceImport`, which sets a request on the store. Nothing read it,
 * so the buttons were live, visible, and did nothing at all: issue #2's dead
 * end, and the reason six `evidence.addSource.*` entries reported themselves
 * unavailable while the form for all of them sat complete and unreferenced.
 *
 * ## Why a sheet rather than the Evidence Hub
 *
 * `ImportPanel` was written to embed in the Hub, which lives inside a session.
 * The buttons that open it do not: they are on global surfaces, reachable with
 * no session open. Sending the user into a session tab to answer a click made
 * somewhere else is the coupling that got this unwired in the first place.
 *
 * A sheet answers the click where it was made. The panel already handles having
 * no real session, with its own empty state, so nothing here needs to guard it.
 *
 * ## Why it reuses the settings sheet's classes
 *
 * Issue #17 counts six overlay implementations. This adds none: it borrows
 * `.settings-sheet-layer` and `-scrim`, which `.project-modal` already reuses,
 * and takes its behaviour from `useOverlayShell`. Converging the existing six
 * needs a visual pass; not adding a seventh does not.
 */
export function ImportSheet() {
  const request = useAppStore((state) => state.evidenceImportRequest);
  const close = useAppStore((state) => state.clearEvidenceImportRequest);
  const { ref } = useOverlayShell({ open: request !== null, onClose: close });

  if (!request) return null;

  return (
    <div className="settings-sheet-layer" role="presentation">
      <div className="settings-sheet-scrim" onClick={close} aria-hidden="true" />
      <div
        ref={ref}
        className="settings-sheet import-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-sheet-title"
        tabIndex={-1}
      >
        <header className="settings-sheet-head">
          <div className="settings-sheet-title">
            <strong id="import-sheet-title">소스 가져오기</strong>
          </div>
          <button
            type="button"
            className="settings-sheet-close"
            onClick={close}
            aria-label="닫기"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="settings-sheet-body import-sheet-body base-scroll">
          {/* The request carries which tab was asked for, which is what the
              panel's `initialKind` was built to receive. */}
          <ImportPanel
            initialKind={request.kind}
            initialAiPlatform={request.platform}
            variant="embedded"
            onClose={close}
          />
        </div>
      </div>
    </div>
  );
}

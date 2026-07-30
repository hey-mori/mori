/**
 * Mori-internal selection adapter · the FIRST capture adapter for the Language
 * Loop, not the product boundary.
 *
 * This component's whole job is to turn a DOM selection inside Mori into a
 * `LanguageCaptureRequest` and host the shared result surface in the session's
 * Context Inspector. The understanding itself, its states, and its rendering
 * live in `features/language`, so the Windows mini overlay reuses them by
 * wrapping the same view in a different shell rather than reimplementing it.
 *
 * L1 scope: ephemeral only. Running an action saves nothing; Remember arrives
 * in L2 as an added action, not a rewrite.
 */
import { useMemo, useState } from "react";
import { Languages } from "lucide-react";
import { BaseInspectorPanel } from "../../components/ui/BaseInspectorPanel";
import { LanguageResultView } from "../language/LanguageResultView";
import { useLanguageAction } from "../language/useLanguageAction";
import type { LanguageCaptureRequest } from "../../lib/language/languageCapture";

export function UnderstandPanel({
  selection,
  contextLabel,
  onClose,
}: {
  selection: string;
  contextLabel?: string;
  onClose: () => void;
}) {
  const [action, setAction] = useState<"understand" | "express">("understand");

  // The adapter states plainly how it got the text and where from; nothing here
  // is inferred, so the panel can never show invented provenance.
  const request = useMemo<LanguageCaptureRequest>(
    () => ({
      origin: "mori-selection",
      content: { contentType: "text", text: selection },
      context: {
        acquiredBy: "dom-selection",
        appName: "Mori",
        projectHint: contextLabel?.trim() || undefined,
      },
      action,
      retentionIntent: "ephemeral",
    }),
    [selection, contextLabel, action],
  );

  const { state, provider, retry, allowProvider } = useLanguageAction(request);

  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel="언어 결과"
      eyebrow={<span className="understand-eyebrow">언어</span>}
      title={
        <span className="understand-title">
          <Languages size={15} aria-hidden="true" />
          선택한 텍스트
        </span>
      }
      onClose={onClose}
    >
      <LanguageResultView
        request={request}
        state={state}
        provider={provider}
        onSelectAction={setAction}
        onRetry={retry}
        onAllowProvider={allowProvider}
      />
    </BaseInspectorPanel>
  );
}

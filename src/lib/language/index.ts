export {
  captureText,
  describeCaptureSource,
  directInputCapture,
  hasActionableText,
  isActionableText,
  MAX_CAPTURE_LENGTH,
  MIN_CAPTURE_LENGTH,
} from "./languageCapture";
export type {
  CapturedLanguageContent,
  CapturedLanguageContext,
  LanguageAction,
  LanguageCaptureOrigin,
  LanguageCaptureRequest,
  LanguageContentType,
  RetentionIntent,
} from "./languageCapture";
export {
  buildLanguagePrompt,
  DEFAULT_LANGUAGE_PROFILE,
  detectDominantLanguage,
  parseLanguageResponse,
  sectionPlan,
} from "./languageAction";
export type {
  LanguageActionResult,
  LanguageCode,
  LanguagePrompt,
  LanguageProfile,
  LanguageSection,
  LanguageSectionKey,
  SelectionKind,
} from "./languageAction";
export { classifySelection, selectionKindLabel } from "./selectionKind";
export { isSyntheticSection, SECTION_SPECS } from "./languageSections";
export type { LanguageSectionSpec } from "./languageSections";
export {
  evaluateConsent,
  createConsentGrant,
  revokeProvider,
  CONSENT_GRANT_VERSION,
} from "./languageConsent";
export type {
  ConsentContext,
  ConsentDecision,
  ConsentScope,
  ProviderConsentGrant,
} from "./languageConsent";

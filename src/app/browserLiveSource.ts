import { createBrowserLiveSource } from "../lib/browser/browserLiveSource";
import { browserEvidenceRepository } from "../lib/browser/browserEvidenceRepository";

export const browserLiveSource = createBrowserLiveSource(browserEvidenceRepository);

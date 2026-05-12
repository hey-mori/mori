import { moriMockSession } from "../../domain/mock-data";
import { createMoriPackageFromSession } from "./serialize";

export const sampleMoriPackageV0 = createMoriPackageFromSession(moriMockSession);

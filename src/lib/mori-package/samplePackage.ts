import { mockSession } from "../../domain/mock-data";
import { createMoriPackageFromSession } from "./serialize";

export const sampleMoriPackageV0 = createMoriPackageFromSession(mockSession);

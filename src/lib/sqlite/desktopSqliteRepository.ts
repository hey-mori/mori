import type { MoriMockSession } from "../../domain/types";
import { tauriCommands } from "../desktop";
import type { TauriSqliteCommands } from "../desktop/tauriCommands";
import { createSqlitePersistenceSnapshot } from "./records";
import type {
  DatabaseStatus,
  ListSessionsOutput,
  LoadSessionSnapshotInput,
  MoriSqliteRepository,
  PersistSessionSnapshotInput,
  PersistSessionSnapshotOutput,
} from "./repositoryContracts";
import { validateSqlitePersistenceSnapshot } from "./snapshotValidation";

export class DesktopSqliteRepository implements MoriSqliteRepository {
  constructor(private readonly commands: TauriSqliteCommands = tauriCommands) {}

  initializeDatabase(): Promise<DatabaseStatus> {
    return this.commands.initializeSqliteDatabase();
  }

  async persistSessionSnapshot(input: PersistSessionSnapshotInput): Promise<PersistSessionSnapshotOutput> {
    const snapshot = createSqlitePersistenceSnapshot(input.session);
    const validation = validateSqlitePersistenceSnapshot(snapshot);

    if (!validation.valid) {
      throw new Error(`Cannot persist invalid SQLite snapshot: ${validation.issues.join("; ")}`);
    }

    return this.commands.persistSessionSnapshot({ snapshot });
  }

  loadSessionSnapshot(input: LoadSessionSnapshotInput): Promise<MoriMockSession> {
    return this.commands.loadSqliteSessionSnapshot(input.sessionId);
  }

  listSessions(): Promise<ListSessionsOutput> {
    return this.commands.listSqliteSessions();
  }
}

export function createDesktopSqliteRepository(commands?: TauriSqliteCommands): DesktopSqliteRepository {
  return new DesktopSqliteRepository(commands);
}

import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { ITransitionLogRepository, TransitionLog } from "../interfaces.js";
import type * as schema from "./schema.js";
import { entityHistory } from "./schema.js";

type Db = BetterSQLite3Database<typeof schema>;

export class DrizzleTransitionLogRepository implements ITransitionLogRepository {
  constructor(private db: Db) {}

  async record(log: Omit<TransitionLog, "id">): Promise<TransitionLog> {
    const id = randomUUID();
    // entityHistory is already written by DrizzleEntityRepository.transition();
    // inserting again here would create duplicate rows.
    return { id, ...log };
  }

  async historyFor(entityId: string): Promise<TransitionLog[]> {
    const rows = this.db
      .select()
      .from(entityHistory)
      .where(eq(entityHistory.entityId, entityId))
      .orderBy(asc(entityHistory.timestamp))
      .all();
    return rows.map((r) => ({
      id: r.id,
      entityId: r.entityId,
      fromState: r.fromState,
      toState: r.toState,
      trigger: r.trigger,
      invocationId: r.invocationId,
      timestamp: new Date(r.timestamp),
    }));
  }
}

import { createTestDb, type TestDb } from "./pg-test-db.js";
import { createScopedRepos, type ScopedRepos } from "../../src/repositories/scoped-repos.js";
import { Engine } from "../../src/engine/engine.js";
import { EventEmitter } from "../../src/engine/event-emitter.js";
import { DomainEventPersistAdapter } from "../../src/engine/domain-event-adapter.js";
import { createHonoApp } from "../../src/api/hono-server.js";
import { loadSeed } from "../../src/config/seed-loader.js";
import type { EngineEvent } from "../../src/engine/event-types.js";
import type { Hono } from "hono";

export const ADMIN_TOKEN = "test-admin-token";
export const WORKER_TOKEN = "test-worker-token";

export interface TestApp {
  app: Hono;
  engine: Engine;
  repos: ScopedRepos;
  db: TestDb;
  eventEmitter: EventEmitter;
  events: EngineEvent[];
  close: () => Promise<void>;
}

export async function createTestApp(opts?: {
  adminToken?: string;
  workerToken?: string;
  tenantId?: string;
  seedPath?: string;
  enableUi?: boolean;
}): Promise<TestApp> {
  const adminToken = opts?.adminToken ?? ADMIN_TOKEN;
  const workerToken = opts?.workerToken ?? WORKER_TOKEN;
  const tenantId = opts?.tenantId ?? "test-tenant";

  const { db, close: closeDb } = await createTestDb();
  const repos = createScopedRepos(db, tenantId);
  const eventEmitter = new EventEmitter();
  const events: EngineEvent[] = [];

  // Capture all emitted events for assertions
  eventEmitter.register({ emit: async (ev) => { events.push(ev); } });
  eventEmitter.register(new DomainEventPersistAdapter(repos.domainEvents));

  // NOTE: withTransaction is intentionally omitted — PGlite is single-connection WASM
  // and db.transaction() deadlocks when the callback queries through the same db handle.
  const engine = new Engine({
    entityRepo: repos.entities,
    flowRepo: repos.flows,
    invocationRepo: repos.invocations,
    gateRepo: repos.gates,
    transitionLogRepo: repos.transitionLog,
    adapters: new Map(),
    eventEmitter,
    domainEvents: repos.domainEvents,
  });

  const mcpDeps = {
    entities: repos.entities,
    flows: repos.flows,
    invocations: repos.invocations,
    gates: repos.gates,
    transitions: repos.transitionLog,
    eventRepo: repos.events,
    domainEvents: repos.domainEvents,
    integrations: repos.integrations,
    engine,
  };

  const app = createHonoApp({
    engine,
    mcpDeps,
    db,
    defaultTenantId: tenantId,
    adminToken,
    workerToken,
    enableUi: opts?.enableUi,
  });

  if (opts?.seedPath) {
    await loadSeed(opts.seedPath, repos.flows, repos.gates, { allowedRoot: process.cwd() });
  }

  return {
    app,
    engine,
    repos,
    db,
    eventEmitter,
    events,
    close: async () => { await closeDb(); },
  };
}

// Convenience request helpers
export function adminHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` };
}

export function workerHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${WORKER_TOKEN}` };
}

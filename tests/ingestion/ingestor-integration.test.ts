import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { serve } from "@hono/node-server";
import { createTestApp, WORKER_TOKEN, type TestApp } from "../helpers/test-app.js";
import { Ingestor } from "../../src/ingestion/ingestor.js";
import { HolyshipClient } from "../../src/holyship-client/client.js";
import type { IEntityMapRepository } from "../../src/radar-db/repos/entity-map-repo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(__dirname, "../fixtures/outer-layer-flow.seed.json");

/**
 * In-memory IEntityMapRepository implementation.
 *
 * DrizzleEntityMapRepository.insertIfAbsent() always returns false with PGlite
 * because PGlite's INSERT ON CONFLICT DO NOTHING doesn't populate rowCount.
 * This mock bypasses that PGlite limitation while still testing the Ingestor logic.
 */
class InMemoryEntityMapRepository implements IEntityMapRepository {
  private rows = new Map<string, string>();

  private key(sourceId: string, externalId: string): string {
    return `${sourceId}::${externalId}`;
  }

  async findEntityId(sourceId: string, externalId: string): Promise<string | undefined> {
    return this.rows.get(this.key(sourceId, externalId));
  }

  async insertIfAbsent(sourceId: string, externalId: string, entityId: string): Promise<boolean> {
    const k = this.key(sourceId, externalId);
    if (this.rows.has(k)) return false;
    this.rows.set(k, entityId);
    return true;
  }

  async updateEntityId(sourceId: string, externalId: string, entityId: string): Promise<void> {
    this.rows.set(this.key(sourceId, externalId), entityId);
  }

  async deleteRow(sourceId: string, externalId: string): Promise<void> {
    this.rows.delete(this.key(sourceId, externalId));
  }
}

describe("Ingestor integration — new entity", () => {
  let t: TestApp;
  let server: http.Server;
  let port: number;
  let ingestor: Ingestor;
  const SOURCE_ID = "test-source-id";

  beforeAll(async () => {
    t = await createTestApp({ seedPath: SEED });

    // Start real HTTP server for HolyshipClient (tests the full HTTP path)
    server = serve({ fetch: t.app.fetch, port: 0, hostname: "127.0.0.1" }) as http.Server;
    await new Promise<void>((r) => {
      if (server.listening) r();
      else server.on("listening", r);
    });
    port = (server.address() as { port: number }).port;

    // Use in-memory entity map repo: PGlite's INSERT ON CONFLICT DO NOTHING
    // does not set rowCount, so DrizzleEntityMapRepository.insertIfAbsent always
    // returns false. The in-memory repo gives correct semantics for unit testing.
    const entityMapRepo = new InMemoryEntityMapRepository();
    const holyshipClient = new HolyshipClient({ url: `http://127.0.0.1:${port}`, workerToken: WORKER_TOKEN });
    ingestor = new Ingestor(entityMapRepo, holyshipClient);
  });

  afterAll(async () => {
    server.close();
    await t.close();
  });

  it("ingest type=new creates an entity in the engine", async () => {
    await ingestor.ingest({
      sourceId: SOURCE_ID,
      externalId: "ext-001",
      type: "new",
      flowName: "outer-test-flow",
    });

    // Verify entity was created in the DB via the engine
    const flow = await t.repos.flows.getByName("outer-test-flow");
    const entities = await t.repos.entities.findByFlowAndState(flow!.id, "open");
    expect(entities.length).toBeGreaterThanOrEqual(1);

    // Verify entity.created domain event was emitted
    const createEvents = t.events.filter((e) => e.type === "entity.created");
    expect(createEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("ingest type=new with no active invocation: signal fires after create but report returns 409", async () => {
    // When ingest sends a signal immediately after entity creation, the entity's
    // passive-mode invocation hasn't been claimed by a worker yet.
    // report() requires a claimed invocation → 409 → Ingestor throws.
    // This verifies that the Ingestor propagates the error (doesn't swallow it).
    await expect(ingestor.ingest({
      sourceId: SOURCE_ID,
      externalId: "ext-002-signal",
      type: "new",
      flowName: "outer-test-flow",
      signal: "start",
    })).rejects.toThrow("flow.report failed: 409");
  });

  it("ingest type=new is idempotent (duplicate externalId ignored)", async () => {
    await ingestor.ingest({
      sourceId: SOURCE_ID,
      externalId: "ext-003",
      type: "new",
      flowName: "outer-test-flow",
    });
    const countBefore = t.events.filter((e) => e.type === "entity.created").length;

    // Second ingest with same sourceId+externalId should be a no-op
    await ingestor.ingest({
      sourceId: SOURCE_ID,
      externalId: "ext-003",
      type: "new",
      flowName: "outer-test-flow",
    });
    const countAfter = t.events.filter((e) => e.type === "entity.created").length;
    expect(countAfter).toBe(countBefore);
  });

  it("ingest type=update for unknown externalId is silently ignored", async () => {
    const eventCount = t.events.length;
    await ingestor.ingest({
      sourceId: SOURCE_ID,
      externalId: "nonexistent",
      type: "update",
      signal: "submit",
      flowName: "outer-test-flow",
    });
    // No new events should have been emitted
    expect(t.events.length).toBe(eventCount);
  });

  it("ingest validates input via Zod schema", async () => {
    await expect(ingestor.ingest({
      sourceId: "",  // min(1) violated
      externalId: "ext-005",
      type: "new",
      flowName: "outer-test-flow",
    })).rejects.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { createHttpServer } from "../../src/api/server.js";

describe("HTTP server timeout configuration", () => {
  it("should disable request timeout to support long-running flow.report calls", () => {
    // Minimal deps — we only care about server config, not routing
    const engine = {} as any;
    const mcpDeps = {
      entities: {},
      flows: { listAll: async () => [] },
      invocations: {},
      gates: {},
      transitions: {},
      eventRepo: {},
      engine: null,
    } as any;

    const server = createHttpServer({ engine, mcpDeps });

    // Node.js defaults: requestTimeout=300000 (5 min), headersTimeout=60000 (1 min)
    // flow.report can block for the duration of gate evaluation (potentially 10+ minutes)
    // Both must be 0 (disabled) to prevent premature disconnects
    expect(server.requestTimeout).toBe(0);
    expect(server.headersTimeout).toBe(0);

    server.close();
  });
});

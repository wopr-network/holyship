import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dispatcher, WorkerResult } from "../dispatcher/types.js";
import { logger } from "../logger.js";
import { Pool } from "../pool/pool.js";
import type { IEntityActivityRepo } from "../radar-db/repos/i-entity-activity-repo.js";
import { RunLoop } from "./run-loop.js";
import type { RunLoopConfig } from "./types.js";

function makeActivityRepo(summary: string): IEntityActivityRepo {
  return {
    insert: vi
      .fn()
      .mockResolvedValue({ id: "x", entityId: "e1", slotId: "s1", seq: 0, type: "start", data: {}, createdAt: 0 }),
    getByEntity: vi.fn().mockResolvedValue([]),
    getSummary: vi.fn().mockResolvedValue(summary),
    deleteByEntity: vi.fn(),
  };
}

function makeSilo(responses: object[]) {
  const iter = responses[Symbol.iterator]();
  return {
    claim: vi.fn().mockImplementation(() => {
      const { value, done } = iter.next();
      if (done) return Promise.resolve({ retry_after_ms: 50 });
      return Promise.resolve(value);
    }),
    report: vi.fn().mockResolvedValue(undefined),
  } as unknown as import("../engine/flow-engine-interface.js").IFlowEngine;
}

function makeDispatcher(result: WorkerResult): Dispatcher {
  return { dispatch: vi.fn().mockResolvedValue(result) };
}

function makeConfig(overrides: Partial<RunLoopConfig> = {}): RunLoopConfig {
  return {
    pool: new Pool(1),
    engine: makeSilo([{ retry_after_ms: 50 }]),
    dispatcher: makeDispatcher({ signal: "pr_created", artifacts: {}, exitCode: 0 }),
    activityRepo: makeActivityRepo(""),
    roles: [{ discipline: "engineering", count: 1 }],
    pollIntervalMs: 5,
    ...overrides,
  };
}

describe("RunLoop — activity history injection on continue", () => {
  it("prepends history to retry prompt when getSummary returns non-empty", async () => {
    const history = "Prior work on this entity:\n\nAttempt 1:\n  - Called tool: Read";
    const activityRepo = makeActivityRepo(history);

    const firstClaim = {
      entity_id: "e-1",
      prompt: "Do the work",
      flow: "engineering",
      entity_type: "issue",
    };

    // Sequence: first claim → dispatch returns pr_created → holyship.report is called
    // To test "continue": holyship.report returns next_action: continue, then done
    let reportCallCount = 0;
    const dispatcher = makeDispatcher({ signal: "pr_created", artifacts: { prNumber: 42 }, exitCode: 0 });
    const holyship = {
      claim: vi.fn().mockResolvedValueOnce(firstClaim).mockResolvedValue({ retry_after_ms: 50 }),
      report: vi.fn().mockImplementation(() => {
        reportCallCount++;
        if (reportCallCount === 1) {
          return Promise.resolve({ next_action: "continue", prompt: "Please retry" });
        }
        return Promise.resolve({ next_action: "done" });
      }),
    } as unknown as import("../engine/flow-engine-interface.js").IFlowEngine;

    const config = makeConfig({ pool: new Pool(1), engine: holyship, dispatcher, activityRepo });
    const loop = new RunLoop(config);
    loop.start();

    // Wait for two dispatch calls (initial + retry)
    await vi.waitFor(() => expect(dispatcher.dispatch).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await loop.stop();

    const secondCallPrompt = vi.mocked(dispatcher.dispatch).mock.calls[1]?.[0];
    expect(secondCallPrompt).toContain("Please retry");
    expect(secondCallPrompt).toContain(history);
    expect(activityRepo.getSummary).toHaveBeenCalledWith("e-1");
  });

  it("passes retry prompt unchanged when getSummary returns empty string", async () => {
    const activityRepo = makeActivityRepo("");

    const firstClaim = {
      entity_id: "e-2",
      prompt: "Original prompt",
      flow: "engineering",
      entity_type: "issue",
    };

    let reportCallCount = 0;
    const dispatcher = makeDispatcher({ signal: "pr_created", artifacts: {}, exitCode: 0 });
    const holyship = {
      claim: vi.fn().mockResolvedValueOnce(firstClaim).mockResolvedValue({ retry_after_ms: 50 }),
      report: vi.fn().mockImplementation(() => {
        reportCallCount++;
        if (reportCallCount === 1) {
          return Promise.resolve({ next_action: "continue", prompt: "Retry please" });
        }
        return Promise.resolve({ next_action: "done" });
      }),
    } as unknown as import("../engine/flow-engine-interface.js").IFlowEngine;

    const config = makeConfig({ pool: new Pool(1), engine: holyship, dispatcher, activityRepo });
    const loop = new RunLoop(config);
    loop.start();

    await vi.waitFor(() => expect(dispatcher.dispatch).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await loop.stop();

    const secondCallPrompt = vi.mocked(dispatcher.dispatch).mock.calls[1]?.[0];
    expect(secondCallPrompt).toBe("Retry please");
  });
});

describe("RunLoop — activityHistory injection on report", () => {
  it("includes activityHistory in report artifacts when activity exists", async () => {
    const summary = "Prior work on this entity:\n\nAttempt 1:\n  - Called tool: Edit(...)";
    const activityRepo = makeActivityRepo(summary);

    const firstClaim = {
      entity_id: "e-hist",
      prompt: "Do the work",
      flow: "engineering",
      entity_type: "issue",
    };

    const holyship = {
      claim: vi.fn().mockResolvedValueOnce(firstClaim).mockResolvedValue({ retry_after_ms: 50 }),
      report: vi.fn().mockResolvedValue({ next_action: "done" }),
    } as unknown as import("../engine/flow-engine-interface.js").IFlowEngine;

    const dispatcher = makeDispatcher({ signal: "pr_created", artifacts: { prNumber: 42 }, exitCode: 0 });
    const config = makeConfig({ pool: new Pool(1), engine: holyship, dispatcher, activityRepo });
    const loop = new RunLoop(config);
    loop.start();

    await vi.waitFor(() => expect(holyship.report).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await loop.stop();

    expect(holyship.report).toHaveBeenCalledWith(
      expect.objectContaining({
        artifacts: expect.objectContaining({
          activityHistory: expect.stringContaining("Prior work on this entity"),
        }),
      }),
    );
  });

  it("does not include activityHistory when getSummary returns empty string", async () => {
    const activityRepo = makeActivityRepo("");

    const firstClaim = {
      entity_id: "e-no-hist",
      prompt: "Do the work",
      flow: "engineering",
      entity_type: "issue",
    };

    const holyship = {
      claim: vi.fn().mockResolvedValueOnce(firstClaim).mockResolvedValue({ retry_after_ms: 50 }),
      report: vi.fn().mockResolvedValue({ next_action: "done" }),
    } as unknown as import("../engine/flow-engine-interface.js").IFlowEngine;

    const dispatcher = makeDispatcher({ signal: "pr_created", artifacts: { prNumber: 1 }, exitCode: 0 });
    const config = makeConfig({ pool: new Pool(1), engine: holyship, dispatcher, activityRepo });
    const loop = new RunLoop(config);
    loop.start();

    await vi.waitFor(() => expect(holyship.report).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await loop.stop();

    const reportCall = vi.mocked(holyship.report).mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect((reportCall?.artifacts as Record<string, unknown> | undefined)?.activityHistory).toBeUndefined();
  });

  it("passes full activityHistory without truncation", async () => {
    const longSummary = "x".repeat(10000);
    const activityRepo = makeActivityRepo(longSummary);

    const firstClaim = {
      entity_id: "e-long",
      prompt: "Do the work",
      flow: "engineering",
      entity_type: "issue",
    };

    const holyship = {
      claim: vi.fn().mockResolvedValueOnce(firstClaim).mockResolvedValue({ retry_after_ms: 50 }),
      report: vi.fn().mockResolvedValue({ next_action: "done" }),
    } as unknown as import("../engine/flow-engine-interface.js").IFlowEngine;

    const dispatcher = makeDispatcher({ signal: "pr_created", artifacts: {}, exitCode: 0 });
    const config = makeConfig({ pool: new Pool(1), engine: holyship, dispatcher, activityRepo });
    const loop = new RunLoop(config);
    loop.start();

    await vi.waitFor(() => expect(holyship.report).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await loop.stop();

    const reportCall = vi.mocked(holyship.report).mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const history = (reportCall?.artifacts as Record<string, unknown> | undefined)?.activityHistory as string;
    expect(history.length).toBe(10000);
  });
});

describe("RunLoop — multi-discipline routing", () => {
  it("routes claims with per-slot discipline", async () => {
    const dispatcher = makeDispatcher({ signal: "done", artifacts: {}, exitCode: 0 });
    const holyship = {
      claim: vi
        .fn()
        .mockResolvedValueOnce({ entity_id: "e-eng", prompt: "eng work", flow: "f1" })
        .mockResolvedValueOnce({ entity_id: "e-ops", prompt: "ops work", flow: "f1" })
        .mockResolvedValue({ retry_after_ms: 50 }),
      report: vi.fn().mockResolvedValue({ next_action: "done" }),
    } as unknown as import("../engine/flow-engine-interface.js").IFlowEngine;

    const config = makeConfig({
      pool: new Pool(2),
      engine: holyship,
      dispatcher,
      roles: [
        { discipline: "engineering", count: 1 },
        { discipline: "devops", count: 1 },
      ],
    });

    const loop = new RunLoop(config);
    loop.start();

    await vi.waitFor(() => expect(holyship.claim).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await loop.stop();

    const claimCalls = vi.mocked(holyship.claim).mock.calls;
    const roles = claimCalls.map((c) => (c[0] as { role: string }).role);
    expect(roles).toContain("engineering");
    expect(roles).toContain("devops");
  });
});

describe("RunLoop — model_tier and agent_role from claim", () => {
  it("passes model_tier from claim to dispatcher", async () => {
    const firstClaim = {
      entity_id: "e-tier",
      invocation_id: "inv-1",
      prompt: "Do the work",
      flow: "engineering",
      stage: "coding",
      context: null,
      model_tier: "opus",
      agent_role: "coder",
    };

    const dispatcher = makeDispatcher({ signal: "pr_created", artifacts: {}, exitCode: 0 });
    const holyship = {
      claim: vi.fn().mockResolvedValueOnce(firstClaim).mockResolvedValue({ retry_after_ms: 50 }),
      report: vi.fn().mockResolvedValue({ next_action: "done" }),
    } as unknown as import("../engine/flow-engine-interface.js").IFlowEngine;

    const config = makeConfig({ pool: new Pool(1), engine: holyship, dispatcher });
    const loop = new RunLoop(config);
    loop.start();

    await vi.waitFor(() => expect(dispatcher.dispatch).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await loop.stop();

    const opts = vi.mocked(dispatcher.dispatch).mock.calls[0]?.[1];
    expect(opts?.modelTier).toBe("opus");
    expect(opts?.agentRole).toBe("coder");
  });

  it("defaults model_tier to sonnet when not present in claim", async () => {
    const firstClaim = {
      entity_id: "e-default",
      invocation_id: "inv-2",
      prompt: "Do the work",
      flow: "engineering",
      stage: "coding",
      context: null,
    };

    const dispatcher = makeDispatcher({ signal: "done", artifacts: {}, exitCode: 0 });
    const holyship = {
      claim: vi.fn().mockResolvedValueOnce(firstClaim).mockResolvedValue({ retry_after_ms: 50 }),
      report: vi.fn().mockResolvedValue({ next_action: "done" }),
    } as unknown as import("../engine/flow-engine-interface.js").IFlowEngine;

    const config = makeConfig({ pool: new Pool(1), engine: holyship, dispatcher });
    const loop = new RunLoop(config);
    loop.start();

    await vi.waitFor(() => expect(dispatcher.dispatch).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await loop.stop();

    const opts = vi.mocked(dispatcher.dispatch).mock.calls[0]?.[1];
    expect(opts?.modelTier).toBe("sonnet");
  });
});

describe("RunLoop — crash report logging", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    errorSpy?.mockRestore();
  });

  it("logs error when crash report fails after slot allocation failure", async () => {
    errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);

    const firstClaim = {
      entity_id: "e-crash",
      prompt: "Do the work",
      flow: "engineering",
      entity_type: "issue",
    };

    const reportError = new Error("DB connection lost");
    const holyship = {
      claim: vi.fn().mockResolvedValueOnce(firstClaim).mockResolvedValue({ retry_after_ms: 50 }),
      report: vi.fn().mockRejectedValueOnce(reportError),
    } as unknown as import("../engine/flow-engine-interface.js").IFlowEngine;

    // Pool of 0 capacity so allocate() returns undefined → triggers the crash report path
    const pool = new Pool(0);
    const dispatcher = makeDispatcher({ signal: "done", artifacts: {}, exitCode: 0 });
    const config = makeConfig({ pool, engine: holyship, dispatcher });
    const loop = new RunLoop(config);
    loop.start();

    // Wait for the report to have been attempted
    await vi.waitFor(() => expect(holyship.report).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await loop.stop();

    expect(errorSpy).toHaveBeenCalledWith(
      "[run-loop] failed to report crash signal",
      expect.objectContaining({ error: "DB connection lost" }),
    );
  });
});

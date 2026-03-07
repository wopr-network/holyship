import { describe, expect, it, vi } from "vitest";
import type { Engine } from "../engine/engine.js";
import type {
  Entity,
  Flow,
  IEntityRepository,
  IFlowRepository,
  IInvocationRepository,
  Invocation,
  State,
} from "../repositories/interfaces.js";
import type { ActiveRunnerDeps, IAIProviderAdapter } from "./active-runner.js";
import { ActiveRunner } from "./active-runner.js";

function makeInvocation(overrides: Partial<Invocation> = {}): Invocation {
  return {
    id: "inv-1",
    entityId: "ent-1",
    stage: "coding",
    mode: "active",
    prompt: "Do the thing",
    context: null,
    claimedBy: "active-runner",
    claimedAt: new Date(),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    signal: null,
    artifacts: null,
    error: null,
    ttlMs: 1800000,
    ...overrides,
  };
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "ent-1",
    flowId: "flow-1",
    state: "coding",
    refs: null,
    artifacts: null,
    claimedBy: null,
    claimedAt: null,
    flowVersion: 1,
    priority: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    affinityWorkerId: null,
    affinityRole: null,
    affinityExpiresAt: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<State> = {}): State {
  return {
    id: "state-1",
    flowId: "flow-1",
    name: "coding",
    modelTier: null,
    mode: "active",
    promptTemplate: "Do {{entity.state}}",
    constraints: null,
    onEnter: null,
    ...overrides,
  };
}

function makeFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: "flow-1",
    name: "test-flow",
    description: null,
    entitySchema: null,
    initialState: "coding",
    maxConcurrent: 0,
    maxConcurrentPerRepo: 0,
    affinityWindowMs: 300000,
    version: 1,
    createdBy: null,
    discipline: null,
    defaultModelTier: null,
    createdAt: null,
    updatedAt: null,
    states: [makeState()],
    transitions: [],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ActiveRunnerDeps> = {}): ActiveRunnerDeps {
  return {
    engine: {} as Engine,
    aiAdapter: { invoke: vi.fn() } as IAIProviderAdapter,
    invocationRepo: {
      findUnclaimedActive: vi.fn().mockResolvedValue([]),
      claim: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
      create: vi.fn(),
    } as unknown as IInvocationRepository,
    entityRepo: {
      get: vi.fn(),
      updateArtifacts: vi.fn(),
    } as unknown as IEntityRepository,
    flowRepo: {
      get: vi.fn(),
      getByName: vi.fn(),
    } as unknown as IFlowRepository,
    ...overrides,
  };
}

function makeFullDeps(
  invocation: Invocation,
  entity: Entity,
  flow: Flow,
  aiAdapter: IAIProviderAdapter,
): ActiveRunnerDeps {
  return makeDeps({
    aiAdapter,
    entityRepo: { get: vi.fn().mockResolvedValue(entity), updateArtifacts: vi.fn() } as unknown as IEntityRepository,
    flowRepo: { get: vi.fn().mockResolvedValue(flow), getByName: vi.fn() } as unknown as IFlowRepository,
    engine: {
      processSignal: vi.fn().mockResolvedValue({ gated: false, terminal: true, gatesPassed: [] }),
    } as unknown as Engine,
    invocationRepo: {
      findUnclaimedActive: vi.fn().mockResolvedValue([invocation]),
      claim: vi.fn().mockResolvedValue(invocation),
      complete: vi.fn().mockResolvedValue(invocation),
      fail: vi.fn(),
      create: vi.fn(),
    } as unknown as IInvocationRepository,
  });
}

describe("ActiveRunner", () => {
  describe("resolveModel via processInvocation", () => {
    it("uses state modelTier=opus to select claude-opus-4-6", async () => {
      const state = makeState({ modelTier: "opus" });
      const flow = makeFlow({ states: [state] });
      const entity = makeEntity();
      const invocation = makeInvocation();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const runner = new ActiveRunner(makeFullDeps(invocation, entity, flow, aiAdapter));
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "claude-opus-4-6" });
    });

    it("uses state modelTier=haiku to select claude-haiku-4-5-20251001", async () => {
      const state = makeState({ modelTier: "haiku" });
      const flow = makeFlow({ states: [state] });
      const entity = makeEntity();
      const invocation = makeInvocation();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const runner = new ActiveRunner(makeFullDeps(invocation, entity, flow, aiAdapter));
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "claude-haiku-4-5-20251001" });
    });

    it("falls back to flow defaultModelTier when state has no modelTier", async () => {
      const state = makeState({ modelTier: null });
      const flow = makeFlow({ states: [state], defaultModelTier: "opus" });
      const entity = makeEntity();
      const invocation = makeInvocation();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const runner = new ActiveRunner(makeFullDeps(invocation, entity, flow, aiAdapter));
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "claude-opus-4-6" });
    });

    it("falls back to DEFAULT_MODEL (sonnet) when neither state nor flow specify tier", async () => {
      const state = makeState({ modelTier: null });
      const flow = makeFlow({ states: [state], defaultModelTier: null });
      const entity = makeEntity();
      const invocation = makeInvocation();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const runner = new ActiveRunner(makeFullDeps(invocation, entity, flow, aiAdapter));
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "claude-sonnet-4-6" });
    });

    it("uses custom modelTierMap when provided", async () => {
      const state = makeState({ modelTier: "fast" });
      const flow = makeFlow({ states: [state] });
      const entity = makeEntity();
      const invocation = makeInvocation();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const deps = { ...makeFullDeps(invocation, entity, flow, aiAdapter), modelTierMap: { fast: "gpt-4o-mini" } };
      const runner = new ActiveRunner(deps);
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "gpt-4o-mini" });
    });

    it("state modelTier overrides flow defaultModelTier", async () => {
      const state = makeState({ modelTier: "haiku" });
      const flow = makeFlow({ states: [state], defaultModelTier: "opus" });
      const entity = makeEntity();
      const invocation = makeInvocation();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const runner = new ActiveRunner(makeFullDeps(invocation, entity, flow, aiAdapter));
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "claude-haiku-4-5-20251001" });
    });
  });
});

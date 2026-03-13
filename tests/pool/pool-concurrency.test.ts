import { describe, it, expect } from "vitest";
import { Pool } from "../../src/pool/pool.js";

describe("Pool — basic operations", () => {
  it("allocate returns slot within capacity", () => {
    const pool = new Pool(2);
    const slot = pool.allocate("s1", "w1", "eng", "e1", "do stuff");
    expect(slot).not.toBeNull();
    expect(slot!.slotId).toBe("s1");
    expect(slot!.state).toBe("claimed");
    expect(pool.availableSlots()).toBe(1);
  });

  it("allocate returns null when capacity exhausted", () => {
    const pool = new Pool(1);
    pool.allocate("s1", "w1", "eng", "e1", "do stuff");
    const slot = pool.allocate("s2", "w2", "eng", "e2", "do stuff");
    expect(slot).toBeNull();
    expect(pool.availableSlots()).toBe(0);
  });

  it("allocate throws on duplicate slotId", () => {
    const pool = new Pool(5);
    pool.allocate("s1", "w1", "eng", "e1", "do stuff");
    expect(() => pool.allocate("s1", "w2", "eng", "e2", "other")).toThrow("Slot already allocated: s1");
  });

  it("release frees capacity", () => {
    const pool = new Pool(1);
    pool.allocate("s1", "w1", "eng", "e1", "do stuff");
    expect(pool.availableSlots()).toBe(0);
    pool.release("s1");
    expect(pool.availableSlots()).toBe(1);
  });

  it("release throws on unknown slot", () => {
    const pool = new Pool(1);
    expect(() => pool.release("nonexistent")).toThrow("Unknown slot: nonexistent");
  });

  it("complete transitions slot to reporting state", () => {
    const pool = new Pool(2);
    pool.allocate("s1", "w1", "eng", "e1", "do stuff");
    pool.complete("s1", { signal: "done", artifacts: {}, exitCode: 0 });
    const slots = pool.activeSlots();
    expect(slots[0].state).toBe("reporting");
    expect(slots[0].result).toEqual({ signal: "done", artifacts: {}, exitCode: 0 });
  });

  it("complete throws on unknown slot", () => {
    const pool = new Pool(1);
    expect(() => pool.complete("nonexistent", { signal: "done", artifacts: {}, exitCode: 0 })).toThrow();
  });

  it("heartbeat updates lastHeartbeat", () => {
    const pool = new Pool(2);
    pool.allocate("s1", "w1", "eng", "e1", "do stuff");
    const before = pool.activeSlots()[0].lastHeartbeat;
    // Wait a tick to ensure Date.now() changes
    const start = Date.now();
    while (Date.now() === start) { /* spin */ }
    pool.heartbeat("s1");
    const after = pool.activeSlots()[0].lastHeartbeat;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("heartbeat is no-op for unknown slot (does not throw)", () => {
    const pool = new Pool(1);
    pool.heartbeat("nonexistent"); // should not throw
  });

  it("setState changes slot state", () => {
    const pool = new Pool(2);
    pool.allocate("s1", "w1", "eng", "e1", "do stuff");
    pool.setState("s1", "working");
    expect(pool.activeSlots()[0].state).toBe("working");
  });

  it("setState throws on unknown slot", () => {
    const pool = new Pool(1);
    expect(() => pool.setState("nonexistent", "working")).toThrow();
  });
});

describe("Pool — capacity and counting", () => {
  it("getCapacity returns configured capacity", () => {
    const pool = new Pool(10);
    expect(pool.getCapacity()).toBe(10);
  });

  it("availableSlots = capacity - active count", () => {
    const pool = new Pool(3);
    pool.allocate("s1", "w1", "eng", "e1", "p1");
    pool.allocate("s2", "w2", "eng", "e2", "p2");
    expect(pool.availableSlots()).toBe(1);
    expect(pool.activeSlots()).toHaveLength(2);
  });

  it("availableSlots never goes below 0", () => {
    const pool = new Pool(0);
    expect(pool.availableSlots()).toBe(0);
  });

  it("activeCountByFlow counts only matching flow", () => {
    const pool = new Pool(10);
    pool.allocate("s1", "w1", "eng", "e1", "p", "flow-a");
    pool.allocate("s2", "w2", "eng", "e2", "p", "flow-a");
    pool.allocate("s3", "w3", "eng", "e3", "p", "flow-b");
    expect(pool.activeCountByFlow("flow-a")).toBe(2);
    expect(pool.activeCountByFlow("flow-b")).toBe(1);
    expect(pool.activeCountByFlow("flow-c")).toBe(0);
  });

  it("activeCountByRepo counts only matching flow+repo", () => {
    const pool = new Pool(10);
    pool.allocate("s1", "w1", "eng", "e1", "p", "flow-a", "repo-x");
    pool.allocate("s2", "w2", "eng", "e2", "p", "flow-a", "repo-x");
    pool.allocate("s3", "w3", "eng", "e3", "p", "flow-a", "repo-y");
    expect(pool.activeCountByRepo("flow-a", "repo-x")).toBe(2);
    expect(pool.activeCountByRepo("flow-a", "repo-y")).toBe(1);
    expect(pool.activeCountByRepo("flow-b", "repo-x")).toBe(0);
  });
});

describe("Pool — concurrent allocate/release patterns", () => {
  it("rapid allocate-release cycles do not corrupt state", () => {
    const pool = new Pool(4);
    for (let i = 0; i < 100; i++) {
      const id = `slot-${i}`;
      const slot = pool.allocate(id, `w${i}`, "eng", `e${i}`, "prompt");
      expect(slot).not.toBeNull();
      pool.complete(id, { signal: "done", artifacts: {}, exitCode: 0 });
      pool.release(id);
    }
    expect(pool.availableSlots()).toBe(4);
    expect(pool.activeSlots()).toHaveLength(0);
  });

  it("fill to capacity then drain completely", () => {
    const pool = new Pool(8);
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const id = `slot-${i}`;
      ids.push(id);
      expect(pool.allocate(id, `w${i}`, "eng", `e${i}`, "p")).not.toBeNull();
    }
    expect(pool.availableSlots()).toBe(0);
    expect(pool.allocate("overflow", "w", "eng", "e", "p")).toBeNull();

    for (const id of ids) {
      pool.release(id);
    }
    expect(pool.availableSlots()).toBe(8);
  });

  it("interleaved allocate/release maintains correct count", () => {
    const pool = new Pool(3);
    pool.allocate("a", "w1", "eng", "e1", "p");
    pool.allocate("b", "w2", "eng", "e2", "p");
    expect(pool.availableSlots()).toBe(1);

    pool.release("a");
    expect(pool.availableSlots()).toBe(2);

    pool.allocate("c", "w3", "eng", "e3", "p");
    pool.allocate("d", "w4", "eng", "e4", "p");
    expect(pool.availableSlots()).toBe(0);

    pool.release("b");
    pool.release("c");
    pool.release("d");
    expect(pool.availableSlots()).toBe(3);
  });

  it("concurrent Promise.all allocations respect capacity", async () => {
    const pool = new Pool(3);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        Promise.resolve(pool.allocate(`s${i}`, `w${i}`, "eng", `e${i}`, "p"))
      )
    );
    const allocated = results.filter((r) => r !== null);
    expect(allocated).toHaveLength(3);
    expect(pool.availableSlots()).toBe(0);
  });

  it("full lifecycle: allocate → setState → heartbeat → complete → release", () => {
    const pool = new Pool(2);
    const slot = pool.allocate("s1", "w1", "eng", "e1", "do the work", "my-flow", "my-repo");
    expect(slot).not.toBeNull();
    expect(slot!.state).toBe("claimed");
    expect(slot!.flowName).toBe("my-flow");
    expect(slot!.repo).toBe("my-repo");

    pool.setState("s1", "working");
    expect(pool.activeSlots()[0].state).toBe("working");

    pool.heartbeat("s1");

    pool.complete("s1", { signal: "spec_ready", artifacts: { url: "https://example.com" }, exitCode: 0 });
    expect(pool.activeSlots()[0].state).toBe("reporting");
    expect(pool.activeSlots()[0].result!.signal).toBe("spec_ready");

    pool.release("s1");
    expect(pool.activeSlots()).toHaveLength(0);
    expect(pool.availableSlots()).toBe(2);
  });
});

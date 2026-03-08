import { describe, expect, it, vi } from "vitest";
import { makeShutdownHandler } from "../../src/execution/cli.js";

describe("makeShutdownHandler", () => {
  it("closes resources and exits with code 1 when stopReaper rejects", async () => {
    const closeable = { close: vi.fn() };
    const exits: number[] = [];
    const mockExit = vi.spyOn(process, "exit").mockImplementation((code) => {
      exits.push(code as number);
    });
    const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const rejectingStopReaper = () => Promise.reject(new Error("reaper tick failed"));
    const shutdown = makeShutdownHandler({ stopReaper: rejectingStopReaper, closeables: [closeable] });

    shutdown();

    await vi.waitFor(() => {
      expect(exits).toEqual([1]);
    });
    expect(closeable.close).toHaveBeenCalledOnce();

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it("closes resources and exits with code 0 when stopReaper resolves", async () => {
    const closeable = { close: vi.fn() };
    const exits: number[] = [];
    const mockExit = vi.spyOn(process, "exit").mockImplementation((code) => {
      exits.push(code as number);
    });

    const resolvingStopReaper = () => Promise.resolve();
    const shutdown = makeShutdownHandler({ stopReaper: resolvingStopReaper, closeables: [closeable] });

    shutdown();

    await vi.waitFor(() => {
      expect(exits).toEqual([0]);
    });
    expect(closeable.close).toHaveBeenCalledOnce();

    mockExit.mockRestore();
  });

  it("exits with code 1 when stopReaper hangs beyond timeout", async () => {
    const closeable = { close: vi.fn() };
    const exits: number[] = [];
    const mockExit = vi.spyOn(process, "exit").mockImplementation((code) => {
      exits.push(code as number);
    });
    const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.useFakeTimers();
    const hangingStopReaper = () => new Promise<void>(() => {});
    const shutdown = makeShutdownHandler({
      stopReaper: hangingStopReaper,
      closeables: [closeable],
      stopReaperTimeoutMs: 100,
    });

    shutdown();
    await vi.advanceTimersByTimeAsync(200);

    expect(exits).toEqual([1]);
    expect(closeable.close).toHaveBeenCalledOnce();

    vi.useRealTimers();
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });
});

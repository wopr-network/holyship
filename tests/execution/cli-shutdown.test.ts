import { describe, it, expect, vi } from "vitest";

describe("CLI shutdown handlers", () => {
  it("should exit with code 1 when stopReaper rejects", async () => {
    const mockSqlite = { close: vi.fn() };
    const exits: number[] = [];
    const mockExit = vi.spyOn(process, "exit").mockImplementation((code) => {
      exits.push(code as number);
    });
    const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const rejectingStopReaper = () => Promise.reject(new Error("reaper tick failed"));

    const shutdown = () => {
      rejectingStopReaper()
        .then(() => {
          mockSqlite.close();
          process.exit(0);
        })
        .catch((err: unknown) => {
          console.error("[shutdown] stopReaper failed:", err);
          mockSqlite.close();
          process.exit(1);
        });
    };

    shutdown();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockSqlite.close).toHaveBeenCalledOnce();
    expect(exits).toEqual([1]);

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it("should exit with code 0 when stopReaper resolves", async () => {
    const mockSqlite = { close: vi.fn() };
    const exits: number[] = [];
    const mockExit = vi.spyOn(process, "exit").mockImplementation((code) => {
      exits.push(code as number);
    });

    const resolvingStopReaper = () => Promise.resolve();

    const shutdown = () => {
      resolvingStopReaper()
        .then(() => {
          mockSqlite.close();
          process.exit(0);
        })
        .catch((err: unknown) => {
          console.error("[shutdown] stopReaper failed:", err);
          mockSqlite.close();
          process.exit(1);
        });
    };

    shutdown();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockSqlite.close).toHaveBeenCalledOnce();
    expect(exits).toEqual([0]);

    mockExit.mockRestore();
  });
});

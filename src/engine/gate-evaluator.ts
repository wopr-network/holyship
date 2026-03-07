import { execFile } from "node:child_process";
import type { Entity, Gate, IGateRepository } from "../repositories/interfaces.js";

export interface GateEvalResult {
  passed: boolean;
  output: string;
}

/**
 * Evaluate a gate against an entity. Records the result in gateRepo.
 * Currently supports "command" type gates only.
 * "function" and "api" types throw — implement when needed.
 */
export async function evaluateGate(gate: Gate, entity: Entity, gateRepo: IGateRepository): Promise<GateEvalResult> {
  let passed = false;
  let output = "";

  if (gate.type === "command") {
    if (!gate.command) {
      return { passed: false, output: "Gate command is not configured" };
    }
    const result = await runCommand(gate.command, gate.timeoutMs);
    passed = result.exitCode === 0;
    output = result.output;
  } else if (gate.type === "function") {
    throw new Error(`Function gates not yet implemented: ${gate.functionRef}`);
  } else if (gate.type === "api") {
    if (!gate.apiConfig) {
      return { passed: false, output: "Gate apiConfig is not configured" };
    }
    const hbs = (await import("./handlebars.js")).getHandlebars();
    const url = hbs.compile(gate.apiConfig.url as string)(entity);
    const method = (gate.apiConfig.method as string) ?? "GET";
    const expectStatus = (gate.apiConfig.expectStatus as number) ?? 200;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), gate.timeoutMs ?? 10000);
    try {
      const res = await fetch(url, { method, signal: controller.signal });
      passed = res.status === expectStatus;
      output = `HTTP ${res.status}`;
    } catch (err) {
      passed = false;
      output = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timeout);
    }
  } else {
    throw new Error(`Unknown gate type: ${gate.type}`);
  }

  await gateRepo.record(entity.id, gate.id, passed, output);
  return { passed, output };
}

function runCommand(command: string, timeoutMs: number): Promise<{ exitCode: number; output: string }> {
  // Split into file + args to avoid shell injection (no shell: true)
  const [file, ...args] = command.split(/\s+/);
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? 1 : 0,
        output: (stdout + stderr).trim(),
      });
    });
  });
}

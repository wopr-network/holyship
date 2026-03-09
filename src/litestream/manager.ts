import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface LitestreamConfig {
  dbPath: string;
  replicaUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  region: string;
  retention: string;
  syncInterval: string;
}

export function isLitestreamEnabled(): boolean {
  return !!process.env.DEFCON_LITESTREAM_REPLICA_URL?.trim();
}

export function buildConfigFromEnv(dbPath: string): LitestreamConfig {
  const replicaUrl = process.env.DEFCON_LITESTREAM_REPLICA_URL ?? "";
  const accessKeyId = process.env.DEFCON_LITESTREAM_ACCESS_KEY_ID;
  const secretAccessKey = process.env.DEFCON_LITESTREAM_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "DEFCON_LITESTREAM_ACCESS_KEY_ID and DEFCON_LITESTREAM_SECRET_ACCESS_KEY must be set when DEFCON_LITESTREAM_REPLICA_URL is configured",
    );
  }
  return {
    dbPath: resolve(dbPath),
    replicaUrl,
    accessKeyId,
    secretAccessKey,
    endpoint: process.env.DEFCON_LITESTREAM_ENDPOINT || undefined,
    region: process.env.DEFCON_LITESTREAM_REGION || "us-east-1",
    retention: process.env.DEFCON_LITESTREAM_RETENTION || "24h",
    syncInterval: process.env.DEFCON_LITESTREAM_SYNC_INTERVAL || "1s",
  };
}

export class LitestreamManager {
  private config: LitestreamConfig;
  private configPath: string;
  private child: ChildProcess | null = null;

  constructor(config: LitestreamConfig) {
    this.config = config;
    this.configPath = join(tmpdir(), `litestream-${process.pid}.yml`);
  }

  generateConfig(): string {
    const endpoint = this.config.endpoint ? `        endpoint: ${this.config.endpoint}\n` : "";
    return `dbs:
  - path: ${this.config.dbPath}
    replicas:
      - type: s3
        url: ${this.config.replicaUrl}
        access-key-id: ${this.config.accessKeyId}
        secret-access-key: ${this.config.secretAccessKey}
${endpoint}        region: ${this.config.region}
        retention: ${this.config.retention}
        sync-interval: ${this.config.syncInterval}
`;
  }

  restore(): void {
    if (existsSync(this.config.dbPath)) {
      process.stderr.write(`[litestream] DB exists at ${this.config.dbPath}, skipping restore\n`);
      return;
    }
    const dir = dirname(this.config.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.writeConfig();
    process.stderr.write(`[litestream] Restoring from ${this.config.replicaUrl}...\n`);
    try {
      execSync(`litestream restore -config ${this.configPath} ${this.config.dbPath}`, {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
      });
      process.stderr.write(`[litestream] Restore complete\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("no generations found")) {
        process.stderr.write(`[litestream] No replica found, starting fresh\n`);
      } else {
        process.stderr.write(`[litestream] Restore failed: ${msg}\n`);
      }
    }
  }

  start(): void {
    this.writeConfig();
    process.stderr.write(`[litestream] Starting replication to ${this.config.replicaUrl}\n`);
    this.child = spawn("litestream", ["replicate", "-config", this.configPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child.stdout?.on("data", (chunk: Buffer) => {
      process.stderr.write(`[litestream] ${chunk.toString()}`);
    });
    this.child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`[litestream] ${chunk.toString()}`);
    });
    this.child.on("exit", (code) => {
      process.stderr.write(`[litestream] Process exited with code ${code}\n`);
      this.child = null;
    });
  }

  close(): void {
    if (this.child) {
      process.stderr.write(`[litestream] Stopping replication\n`);
      this.child.kill("SIGTERM");
      this.child = null;
    }
  }

  private writeConfig(): void {
    writeFileSync(this.configPath, this.generateConfig());
  }
}

import { describe, expect, it } from "vitest";
import { isLitestreamEnabled, LitestreamManager } from "./manager.js";

describe("isLitestreamEnabled", () => {
  it("returns false when DEFCON_LITESTREAM_REPLICA_URL is not set", () => {
    delete process.env.DEFCON_LITESTREAM_REPLICA_URL;
    expect(isLitestreamEnabled()).toBe(false);
  });

  it("returns true when DEFCON_LITESTREAM_REPLICA_URL is set", () => {
    process.env.DEFCON_LITESTREAM_REPLICA_URL = "s3://bucket/defcon.db";
    expect(isLitestreamEnabled()).toBe(true);
    delete process.env.DEFCON_LITESTREAM_REPLICA_URL;
  });
});

describe("LitestreamManager", () => {
  it("generates correct YAML config", () => {
    const mgr = new LitestreamManager({
      dbPath: "/data/defcon.db",
      replicaUrl: "s3://bucket/defcon.db",
      accessKeyId: "AKIA...",
      secretAccessKey: "secret",
      region: "us-east-1",
      retention: "24h",
      syncInterval: "1s",
    });
    const yaml = mgr.generateConfig();
    expect(yaml).toContain("'/data/defcon.db'");
    expect(yaml).toContain("'s3://bucket/defcon.db'");
    expect(yaml).not.toContain("AKIA...");
    expect(yaml).toContain("retention: '24h'");
    expect(yaml).toContain("sync-interval: '1s'");
  });

  it("generates config with custom endpoint for R2", () => {
    const mgr = new LitestreamManager({
      dbPath: "/data/defcon.db",
      replicaUrl: "s3://bucket/defcon.db",
      accessKeyId: "key",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      region: "auto",
      retention: "24h",
      syncInterval: "1s",
    });
    const yaml = mgr.generateConfig();
    expect(yaml).toContain("endpoint: 'https://account.r2.cloudflarestorage.com'");
  });
});

import { describe, it, expect } from "vitest";
import { encryptCredentials, decryptCredentials } from "../../src/integrations/encrypt.js";
import type { IntegrationCredentials } from "../../src/integrations/types.js";

describe("encrypt / decrypt credentials", () => {
  const creds: IntegrationCredentials = {
    provider: "linear",
    accessToken: "lin_api_abc123xyz",
    workspaceId: "ws-1",
  };

  it("roundtrips credentials through encrypt then decrypt", () => {
    const encrypted = encryptCredentials(creds);
    const decrypted = decryptCredentials(encrypted);
    expect(decrypted).toEqual(creds);
  });

  it("produces different ciphertext on each call (random IV)", () => {
    const a = encryptCredentials(creds);
    const b = encryptCredentials(creds);
    expect(a).not.toBe(b);
  });

  it("encrypted string has format iv:tag:ciphertext (3 hex parts)", () => {
    const encrypted = encryptCredentials(creds);
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    // Each part is valid hex
    for (const p of parts) {
      expect(p).toMatch(/^[0-9a-f]+$/);
    }
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // Tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
  });

  it("throws on malformed input (wrong number of parts)", () => {
    expect(() => decryptCredentials("abc:def")).toThrow("Invalid encrypted credential format");
    expect(() => decryptCredentials("a:b:c:d")).toThrow("Invalid encrypted credential format");
  });

  it("throws on invalid IV length", () => {
    const encrypted = encryptCredentials(creds);
    const parts = encrypted.split(":");
    // Replace IV with a short hex string (not 12 bytes)
    const bad = `aabb:${parts[1]}:${parts[2]}`;
    expect(() => decryptCredentials(bad)).toThrow("Invalid encrypted credential components");
  });

  it("throws on invalid tag length", () => {
    const encrypted = encryptCredentials(creds);
    const parts = encrypted.split(":");
    const bad = `${parts[0]}:aabb:${parts[2]}`;
    expect(() => decryptCredentials(bad)).toThrow("Invalid encrypted credential components");
  });

  it("throws when decrypting with tampered ciphertext", () => {
    const encrypted = encryptCredentials(creds);
    const parts = encrypted.split(":");
    // Flip a byte in the ciphertext
    const tampered = parts[2]!.slice(0, -2) + "ff";
    const bad = `${parts[0]}:${parts[1]}:${tampered}`;
    expect(() => decryptCredentials(bad)).toThrow();
  });

  it("throws when SILO_ENCRYPTION_KEY is missing", () => {
    const original = process.env.SILO_ENCRYPTION_KEY;
    try {
      delete process.env.SILO_ENCRYPTION_KEY;
      expect(() => encryptCredentials(creds)).toThrow("SILO_ENCRYPTION_KEY is required");
    } finally {
      process.env.SILO_ENCRYPTION_KEY = original;
    }
  });

  it("throws when SILO_ENCRYPTION_KEY is wrong length", () => {
    const original = process.env.SILO_ENCRYPTION_KEY;
    try {
      process.env.SILO_ENCRYPTION_KEY = "abcd"; // too short
      expect(() => encryptCredentials(creds)).toThrow("must be a 64-character hex string");
    } finally {
      process.env.SILO_ENCRYPTION_KEY = original;
    }
  });

  it("handles credentials with special characters", () => {
    const special: IntegrationCredentials = {
      provider: "jira",
      accessToken: 'token-with-"quotes"-and-{braces}',
      cloudId: "cloud-1",
      baseUrl: "https://example.atlassian.net",
    };
    const encrypted = encryptCredentials(special);
    const decrypted = decryptCredentials(encrypted);
    expect(decrypted).toEqual(special);
  });
});

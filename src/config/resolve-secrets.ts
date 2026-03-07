const ENV_REF_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)}/g;

function resolveString(value: string, seen: Set<string>): string {
  return value.replace(ENV_REF_PATTERN, (_match, varName: string) => {
    if (seen.has(varName)) {
      throw new Error(`Circular reference detected for environment variable "${varName}"`);
    }
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new Error(`Environment variable "${varName}" is not set (referenced in integration config)`);
    }
    seen.add(varName);
    const resolved = resolveString(envValue, seen);
    seen.delete(varName);
    return resolved;
  });
}

function resolveValue(value: unknown, seen: Set<string>): unknown {
  if (typeof value === "string") {
    return resolveString(value, seen);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, seen));
  }
  if (typeof value === "object" && value !== null) {
    return resolveRecord(value as Record<string, unknown>, seen);
  }
  return value;
}

function resolveRecord(obj: Record<string, unknown>, seen: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = resolveValue(val, seen);
  }
  return result;
}

export function resolveConfigSecrets(config: Record<string, unknown> | null): Record<string, unknown> | null {
  if (config === null) return null;
  return resolveRecord(config, new Set<string>());
}

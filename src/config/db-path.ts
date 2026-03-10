import { existsSync } from "node:fs";

const LEGACY_DB = "./defcon.db";
const DEFAULT_DB = "./silo.db";

function resolveDbPath(): string {
  const env = process.env.SILO_DB_PATH?.trim();
  if (env) return env;

  if (existsSync(DEFAULT_DB)) return DEFAULT_DB;

  if (existsSync(LEGACY_DB)) {
    process.stderr.write(
      `[silo] Using legacy database "${LEGACY_DB}". Rename to "${DEFAULT_DB}" or set SILO_DB_PATH.\n`,
    );
    return LEGACY_DB;
  }

  return DEFAULT_DB;
}

export const DB_PATH = resolveDbPath();

export function getDatabaseUrl(): string {
  return (
    process.env.HOLYSHIP_DB_URL?.trim() || process.env.DATABASE_URL?.trim() || "postgresql://localhost:5432/holyship"
  );
}

export const DATABASE_URL = getDatabaseUrl();

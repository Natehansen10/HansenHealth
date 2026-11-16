import "server-only";
import postgres from "postgres";

// One connection pool for the whole server. The browser never talks to the
// database: every query runs here, on the server, with a connection string
// that lives only in the DATABASE_URL environment variable.
//
// prepare: false is required by Supabase's transaction pooler (port 6543),
// which hands each query to a different backend connection.

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and paste the Supabase connection string.",
    );
  }
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]|host=\//.test(url);
  return postgres(url, {
    prepare: false,
    max: 5,
    ssl: isLocal ? false : "require",
  });
}

// Reuse the pool across hot reloads in development.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };
export const sql = globalForDb.sql ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

// Postgres error codes the app turns into friendly messages.
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_CHECK_VIOLATION = "23514";

export function pgErrorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

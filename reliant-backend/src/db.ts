// src/infra/db.ts
import { Pool, PoolConfig } from "pg";

declare global {
  // Reuse a single Pool across hot reloads in dev (e.g., Next/Vite).
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

// ---------------------------------------------------------------------
// Connection string
// Narrow DATABASE_URL to a string and fail fast if missing.
// (Safer in prod; in local dev you can add a fallback if you want.)
// ---------------------------------------------------------------------
const rawConn = process.env.DATABASE_URL;
if (!rawConn) {
  // Prefer failing fast in prod; swap to a dev fallback if you want
  // e.g.: const devFallback = "postgres://postgres:postgres@localhost:5432/mydb";
  // const rawConn = process.env.DATABASE_URL ?? devFallback;
  throw new Error(
    "DATABASE_URL is not set. Add it to your environment (e.g. .env)."
  );
}

// ---------------------------------------------------------------------
// SSL (hosted Postgres usually needs this; opt-in via PGSSL=true as well)
// NOTE: rejectUnauthorized:false is common for managed DBs with proxy certs.
// ---------------------------------------------------------------------
const needsSSL =
  /supabase|neon|render|heroku|aws|azure/i.test(rawConn) ||
  /^true$/i.test(process.env.PGSSL ?? "");

const config: PoolConfig = { connectionString: rawConn };
if (needsSSL) config.ssl = { rejectUnauthorized: false };

// TODO: consider pool sizing / timeouts in prod:
// config.max = 10; config.idleTimeoutMillis = 30_000; config.connectionTimeoutMillis = 5_000;

// ---------------------------------------------------------------------
// Pool (singleton-ish) — reuse between HMR reloads to avoid connection leaks
// ---------------------------------------------------------------------
export const pool = globalThis.__pgPool ?? new Pool(config);
if (!globalThis.__pgPool) globalThis.__pgPool = pool;

// ---------------------------------------------------------------------
// Tiny query helpers
// - Grab a client, run the query, release. Keep these boring.
// - Always pass params to avoid injection. (Don’t build SQL with string concat.)
// ---------------------------------------------------------------------
export const db = {
  // Return first row or null
  async oneOrNone<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const c = await pool.connect();
    try {
      const r = await c.query(sql, params);
      return (r.rows[0] as T) ?? null;
    } finally {
      c.release();
    }
  },

  // Return all rows (empty array if none)
  async many<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const c = await pool.connect();
    try {
      const r = await c.query(sql, params);
      return r.rows as T[];
    } finally {
      c.release();
    }
  },
};

// FYI / Ops notes:
// - You can set `statement_timeout` at the session/DB level to avoid runaway queries.
// - For serverless platforms, consider provider-specific clients (e.g., neon) if needed.
// - Log pool errors: pool.on('error', ...) — but avoid noisy logs in prod.

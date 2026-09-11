import pg from "pg";
import { mkdir } from "node:fs/promises";

export async function createDatabase(config) {
  if (!config.databaseUrl) {
    if (config.production)
      throw new Error("A PostgreSQL database is required.");
    const { PGlite } = await import("@electric-sql/pglite");
    if (config.dataDir && config.dataDir !== "memory://")
      await mkdir(config.dataDir, { recursive: true });
    const local = new PGlite(config.dataDir);
    await local.waitReady;
    return {
      kind: "local",
      query: (sql, params = []) => local.query(sql, params),
      transaction: (fn) =>
        local.transaction((tx) =>
          fn({ query: (sql, params = []) => tx.query(sql, params) }),
        ),
      exec: (sql) => local.exec(sql),
      close: () => local.close(),
    };
  }
  const url = new URL(config.databaseUrl);
  // pg connection-string SSL options override the explicit ssl object. Strip them
  // so certificate verification can never be weakened by a URL parameter.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  if (config.production && !config.databaseSsl)
    throw new Error("Database TLS is required in production.");
  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    ssl: config.databaseSsl
      ? {
          rejectUnauthorized: true,
          ...(config.databaseCa ? { ca: config.databaseCa } : {}),
        }
      : false,
  });
  pool.on("error", (e) =>
    console.error("Database connection error:", e.code || "unknown"),
  );
  return {
    kind: "postgres",
    query: (sql, params) => pool.query(sql, params),
    exec: (sql) => pool.query(sql),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

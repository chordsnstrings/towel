import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config.js";
import { createDatabase } from "./db.js";

export async function migrate(db) {
  const dir = new URL("./migrations/", import.meta.url);
  await db.transaction(async (tx) => {
    if (db.kind === "postgres")
      await tx.query("SELECT pg_advisory_xact_lock(64201901)");
    await tx.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    for (const name of (await readdir(dir))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (
          await tx.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rows.length
      )
        continue;
      const sql = await readFile(new URL(name, dir), "utf8");
      // Each shipped migration consists of simple DDL with no procedural bodies.
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await tx.query(statement);
      await tx.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = await createDatabase(getConfig());
  try {
    await migrate(db);
    console.log("Database migrations complete.");
  } finally {
    await db.close();
  }
}

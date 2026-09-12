import { randomUUID } from "node:crypto";
import { createDatabase } from "../server/db.js";

// Test files must not share staff or migration state when CI uses one server.
// Allocate a new schema for each fixture; never clear an existing schema.
export async function createTestDatabase(config) {
  if (!config.databaseUrl) return createDatabase(config);
  const control = await createDatabase(config);
  const schema = "test_" + randomUUID().replaceAll("-", "");
  let db;
  try {
    await control.query(`CREATE SCHEMA "${schema}"`);
    const url = new URL(config.databaseUrl);
    const options = url.searchParams.get("options") || "";
    url.searchParams.set(
      "options",
      `${options} -c search_path=${schema}`.trim(),
    );
    db = await createDatabase({ ...config, databaseUrl: url.toString() });
    return {
      ...db,
      async close() {
        await db.close();
        try {
          await control.query(`DROP SCHEMA "${schema}" CASCADE`);
        } finally {
          await control.close();
        }
      },
    };
  } catch (error) {
    await db?.close();
    try {
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await control.close();
    }
    throw error;
  }
}

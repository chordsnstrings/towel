import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import settings from "../app.config.json" with { type: "json" };
import { createDatabase } from "../server/db.js";
import { migrate } from "../server/migrate.js";
import { provisionInitialAdmin } from "../server/auth.js";
import { getNeonConnection } from "./neon-connection.mjs";

let db;
try {
  let connection;
  if (!process.argv.includes("--local")) {
    // Keep the database credential in this process only: no environment file,
    // command-line password, build output, or frontend bundle.
    connection = await getNeonConnection();
  }
  db = await createDatabase({
    databaseUrl: connection,
    databaseSsl: true,
    production: !!connection,
    dataDir: fileURLToPath(new URL("../data/local", import.meta.url)),
  });
  await migrate(db);
  const password = randomBytes(24).toString("base64url");
  const result = await provisionInitialAdmin(db, {
    email: settings.initialAdminEmail,
    password,
  });
  // Run only in a trusted terminal, never a public build log. The password is
  // shown once for handover and only its scrypt hash is stored in PostgreSQL.
  console.log(
    JSON.stringify({
      ...result,
      ...(result.created
        ? { temporaryPassword: password, changePasswordOnFirstLogin: true }
        : {
            message:
              "An administrator already exists. Its login was not changed.",
          }),
    }),
  );
} catch (error) {
  console.error(
    "Administrator setup could not finish. Check Neon connection access, then retry. Existing accounts are never reset by this command.",
  );
  console.error("Error type:", error.code || error.name);
  process.exitCode = 1;
} finally {
  await db?.close();
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import settings from "../app.config.json" with { type: "json" };
import { getNeonConnection } from "./neon-connection.mjs";

const execute = promisify(execFile);
const cli = fileURLToPath(
  new URL("../node_modules/netlify-cli/bin/run.js", import.meta.url),
);
const root = fileURLToPath(new URL("../", import.meta.url));
const run = (args) =>
  execute(process.execPath, [cli, ...args], {
    cwd: root,
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
let temporary;
try {
  const databaseUrl = await getNeonConnection();
  await run(["link", "--id", settings.netlify.siteId]);
  temporary = await mkdtemp(join(tmpdir(), "move-config-"));
  const input = join(temporary, "database.json");
  await writeFile(
    input,
    JSON.stringify({
      version: 1,
      projectId: settings.neon.projectId,
      branch: settings.neon.branch,
      databaseUrl,
    }),
    { mode: 0o600 },
  );
  await run([
    "blobs:set",
    settings.netlify.configStore,
    "production-database",
    "--input",
    input,
    "--force",
  ]);
  console.log(
    "The production database connection is saved in the site's private configuration store. No environment variables are needed.",
  );
} catch (error) {
  // CLI errors can contain URLs or response details: do not echo captured output.
  console.error(
    "Database connection setup could not finish. Verify Neon connection access and Netlify sign-in, then retry.",
  );
  console.error("Error type:", error.code || error.name);
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}

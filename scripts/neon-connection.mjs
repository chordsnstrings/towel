import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import settings from "../app.config.json" with { type: "json" };

const execute = promisify(execFile);
export async function getNeonConnection() {
  const { stdout } = await execute(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/neon/dist/cli.js", import.meta.url),
      ),
      "connection-string",
      settings.neon.branch,
      "--project-id",
      settings.neon.projectId,
      "--pooled=false",
      "--ssl=verify-full",
      "--no-color",
    ],
    { timeout: 30000, maxBuffer: 1024 * 1024 },
  );
  const connection = stdout.match(/postgres(?:ql)?:\/\/[^\s'"\x1b]+/)?.[0];
  if (!connection) throw new Error("connection_unavailable");
  return connection;
}

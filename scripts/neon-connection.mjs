import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { createInterface } from "node:readline";
import settings from "../app.config.json" with { type: "json" };

const execute = promisify(execFile);
export async function getNeonConnection() {
  if (process.argv.includes("--connection-stdin")) {
    // Authenticated integrations can supply one private JSON line without CLI
    // credentials, environment variables, command arguments, or an env file.
    if (process.stdin.isTTY) throw new Error("Use a private input pipe.");
    const input = createInterface({ input: process.stdin, terminal: false });
    try {
      const signal = AbortSignal.timeout(30000);
      const [line] = await Promise.race([
        once(input, "line", { signal }),
        once(input, "close", { signal }).then(() => {
          throw new Error("Connection input closed.");
        }),
      ]);
      if (Buffer.byteLength(line) > 16384)
        throw new Error("Invalid connection input.");
      return validateConnection(JSON.parse(line).databaseUrl);
    } finally {
      input.close();
      process.stdin.pause();
    }
  }
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
  return validateConnection(connection);
}

function validateConnection(connection) {
  if (typeof connection !== "string")
    throw new Error("Invalid connection input.");
  const url = new URL(connection);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname.endsWith(".neon.tech") ||
    url.hostname.includes("-pooler.") ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2
  )
    throw new Error("A direct Neon database connection is required.");
  return connection;
}

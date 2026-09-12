import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import settings from "../app.config.json" with { type: "json" };

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(
  new URL("../node_modules/neon/dist/cli.js", import.meta.url),
);
const target = [
  "--project-id",
  settings.neon.projectId,
  "--branch",
  settings.neon.branch,
  "--context-file",
  fileURLToPath(new URL("../.neon", import.meta.url)),
];
const commands = {
  login: ["login"],
  link: ["link", ...target, "-y", "--no-env-pull"],
  plan: ["config", "plan", ...target],
  deploy: ["deploy", ...target, "--no-env-pull"],
};
const command = commands[process.argv[2]];
if (!command) throw new Error("Choose login, link, plan, or deploy.");
const child = spawn(
  process.execPath,
  [cli, ...command, ...process.argv.slice(3)],
  { cwd: root, stdio: "inherit" },
);
child.on("error", () => {
  console.error("Could not start the Neon CLI. Run npm ci first.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

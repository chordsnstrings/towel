import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { getConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { migrate } from "./migrate.js";
import { bootstrapAdmin } from "./auth.js";
import { createApp } from "./app.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = getConfig();
const db = await createDatabase(config);
await migrate(db);
if (config.demo) {
  const { seedDemo } = await import("./demo.js");
  await seedDemo(db);
}
await bootstrapAdmin(db, config);
const app = await createApp(db, config);
let vite;
if (config.production) {
  if (!existsSync(resolve(root, "dist/index.html")))
    throw new Error("Run npm run build before starting production.");
  app.use(
    express.static(resolve(root, "dist"), { index: false, maxAge: "1h" }),
  );
  app.get("/{*path}", (req, res) =>
    res.sendFile(resolve(root, "dist/index.html"), {
      headers: { "Cache-Control": "no-cache" },
    }),
  );
} else {
  const { createServer } = await import("vite");
  vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
  });
  app.use(vite.middlewares);
  app.get("/{*path}", async (req, res, next) => {
    try {
      const html = await vite.transformIndexHtml(
        req.originalUrl,
        readFileSync(resolve(root, "index.html"), "utf8"),
      );
      res.type("html").send(html);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
const server = app.listen(config.port, "0.0.0.0", () =>
  console.log(
    `MOVE towel desk listening on port ${config.port}${config.demo ? " (development demo)" : ""}.`,
  ),
);
const cleanup = setInterval(() => {
  db.query("DELETE FROM sessions WHERE expires_at<NOW()").catch(() => {});
  db.query("DELETE FROM import_jobs WHERE expires_at<NOW()").catch(() => {});
  db.query("DELETE FROM login_limits WHERE reset_at<NOW()").catch(() => {});
}, 3600000);
cleanup.unref();
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(cleanup);
  server.close(async () => {
    await vite?.close();
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

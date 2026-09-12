import { getStore } from "@netlify/blobs";
import settings from "../app.config.json" with { type: "json" };
import { getConfig } from "./config.js";

// Only the server reads this fixed key. Never expose a generic Blob endpoint.
async function readConnection() {
  return getStore({
    name: settings.netlify.configStore,
    consistency: "strong",
  }).get("production-database", { type: "json" });
}

export async function loadPrivateConfig(
  context,
  env = process.env,
  read = readConnection,
) {
  // Retain compatibility with other PostgreSQL hosts and isolated test deploys.
  if (env.DATABASE_URL) return getConfig({ ...env, NODE_ENV: "production" });

  // Netlify provides this context; request headers cannot select the store.
  // Previews must never silently attach to the production database.
  if (
    context?.deploy?.context !== "production" ||
    context?.site?.id !== settings.netlify.siteId
  )
    throw new Error("Production database configuration is unavailable here.");
  const stored = await read();
  if (
    stored?.version !== 1 ||
    stored.projectId !== settings.neon.projectId ||
    stored.branch !== settings.neon.branch ||
    typeof stored.databaseUrl !== "string"
  )
    throw new Error("Run npm run setup:netlify to connect the database.");
  let url;
  try {
    url = new URL(stored.databaseUrl);
  } catch {
    throw new Error("Invalid private database configuration.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname.endsWith(".neon.tech") ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2
  )
    throw new Error("Invalid private database configuration.");
  // Pass the credential in memory; do not mutate process.env or create .env files.
  return getConfig({
    ...env,
    NODE_ENV: "production",
    DATABASE_URL: stored.databaseUrl,
  });
}

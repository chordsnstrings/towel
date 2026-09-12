import appSettings from "../app.config.json" with { type: "json" };

export function getConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const appOrigin =
    env.APP_ORIGIN ||
    (production ? appSettings.origin : "http://localhost:8080");
  if (production && !env.DATABASE_URL)
    throw new Error("DATABASE_URL is required in production.");
  if (production && env.DEMO_MODE === "true")
    throw new Error("DEMO_MODE must be disabled in production.");
  if (production && !/^https:\/\//.test(appOrigin))
    throw new Error("APP_ORIGIN must be the HTTPS application URL.");
  const origin = new URL(appOrigin);
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error(
      "APP_ORIGIN must contain only the application origin, without a path or credentials.",
    );
  return {
    production,
    databaseUrl: env.DATABASE_URL,
    databaseCa: env.DATABASE_CA_CERT?.replace(/\\n/g, "\n"),
    databaseSsl: env.DATABASE_SSL !== "false",
    port: Number(env.PORT || 8080),
    origin: origin.origin,
    demo: !production && env.DEMO_MODE === "true",
    adminEmail: env.ADMIN_EMAIL?.trim().toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD,
    dataDir: env.DATA_DIR || "data/local",
    sessionHours: 12,
  };
}

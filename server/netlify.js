import serverless from "serverless-http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isIP } from "node:net";
import { getConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { migrate } from "./migrate.js";
import { bootstrapAdmin } from "./auth.js";
import { createApp } from "./app.js";
import { loadPrivateConfig } from "./private-config.js";

export function getNetlifyConfig(env = process.env) {
  return {
    ...getConfig({
      ...env,
      NODE_ENV: "production",
    }),
    serverless: true,
    importWorkerPath: resolve(".netlify/runtime/import-worker.cjs"),
    migrationsDirectory: pathToFileURL(resolve("server/migrations") + "/"),
  };
}

export function createNetlifyHandler({
  loadConfig = async (context) => ({
    ...(await loadPrivateConfig(context)),
    serverless: true,
    importWorkerPath: resolve(".netlify/runtime/import-worker.cjs"),
    migrationsDirectory: pathToFileURL(resolve("server/migrations") + "/"),
  }),
  connect = createDatabase,
} = {}) {
  let ready;
  async function initialize(context) {
    const config = await loadConfig(context);
    const db = await connect(config);
    try {
      await migrate(db, config.migrationsDirectory);
      await bootstrapAdmin(db, config);
      await db.query("DELETE FROM sessions WHERE expires_at<NOW()");
      await db.query("DELETE FROM import_jobs WHERE expires_at<NOW()");
      await db.query("DELETE FROM login_limits WHERE reset_at<NOW()");
      const app = await createApp(db, config);
      return serverless(app, {
        request(req, event) {
          // Use Netlify's context.ip, not a caller-supplied forwarded header.
          req.netlifyClientIp = event.requestContext.identity.sourceIp;
        },
      });
    } catch (error) {
      await db.close().catch(() => {});
      throw error;
    }
  }
  return async (request, context = {}) => {
    let handle;
    try {
      ready ||= initialize(context).catch((error) => {
        ready = undefined; // A transient database outage must not poison a warm instance.
        throw error;
      });
      handle = await ready;
    } catch (error) {
      console.error(
        "Towel API initialization failed:",
        error.code || error.name,
      );
      return Response.json(
        {
          error:
            "The towel desk is unavailable. Ask the administrator to check its database and deployment settings.",
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store", "Retry-After": "10" },
        },
      );
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(
      /^\/\.netlify\/functions\/api(?=\/|$)/,
      "/api",
    );
    const query = Object.create(null);
    for (const [key, value] of url.searchParams)
      (query[key] ||= []).push(value);
    const bytes = Buffer.from(await request.arrayBuffer());
    const result = await handle(
      {
        httpMethod: request.method,
        path,
        headers: Object.fromEntries(request.headers),
        multiValueQueryStringParameters: query,
        body: bytes.toString("base64"),
        isBase64Encoded: true,
        requestContext: {
          identity: {
            sourceIp: isIP(context.ip || "") ? context.ip : "unknown",
          },
        },
      },
      { callbackWaitsForEmptyEventLoop: false },
    );
    const body = Buffer.from(
      result.body || "",
      result.isBase64Encoded ? "base64" : "utf8",
    );
    if (body.length > 5 * 1024 * 1024)
      return Response.json(
        {
          error:
            "This result is too large. Use a smaller import or a shorter export date range.",
        },
        { status: 413, headers: { "Cache-Control": "no-store" } },
      );
    const headers = new Headers(result.headers);
    for (const [name, values] of Object.entries(
      result.multiValueHeaders || {},
    )) {
      headers.delete(name);
      for (const value of values) headers.append(name, value);
    }
    return new Response(
      request.method === "HEAD" || [204, 304].includes(result.statusCode)
        ? null
        : body,
      { status: result.statusCode, headers },
    );
  };
}

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { createTestDatabase } from "./database.js";
import { getConfig } from "../server/config.js";
import { createNetlifyHandler, getNetlifyConfig } from "../server/netlify.js";

const origin = "https://towel.example.test";
const password = "Netlify-test-password-9384";
let db, handler, other, auth;
const runtimeConfig = {
  ...getConfig({
    ADMIN_EMAIL: "netlify-admin@example.test",
    ADMIN_PASSWORD: password,
  }),
  production: true,
  origin,
  serverless: true,
  importWorkerPath: new URL("../server/import-worker.js", import.meta.url),
};
function instance() {
  return createNetlifyHandler({
    loadConfig: () => runtimeConfig,
    connect: async () => db,
  });
}
async function call(
  path,
  {
    method = "GET",
    body,
    session = auth,
    ip = "192.0.2.10",
    use = handler,
    headers = {},
  } = {},
) {
  const response = await use(
    new Request(origin + path, {
      method,
      headers: {
        Origin: origin,
        ...(session
          ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
          : {}),
        ...(body && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...headers,
      },
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
    }),
    { ip },
  );
  return {
    status: response.status,
    headers: response.headers,
    data: response.headers.get("content-type")?.includes("json")
      ? await response.json()
      : await response.text(),
  };
}
before(async () => {
  db = await createTestDatabase(
    getConfig({
      DATA_DIR: "memory://",
      ...(process.env.TEST_DATABASE_URL
        ? { DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: "false" }
        : {}),
    }),
  );
  handler = instance();
  other = instance();
  // Two independent cold starts safely run migrations and bootstrap the same admin.
  const health = await Promise.all([
    call("/api/health"),
    call("/.netlify/functions/api/health", { use: other }),
  ]);
  assert.ok(health.every((r) => r.status === 200));
  const login = await call("/api/auth/login", {
    method: "POST",
    body: { email: runtimeConfig.adminEmail, password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  const cookie = login.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  auth = { cookie: cookie.split(";")[0], csrf: login.data.csrfToken };
});
after(async () => {
  await db?.close();
});

test("Netlify adapter preserves sessions, CSRF, query strings and towel transactions across instances", async () => {
  assert.equal((await call("/api/auth/me", { use: other })).status, 200);
  assert.equal((await call("/api/members", { session: null })).status, 401);
  assert.equal(
    (
      await call("/api/members", {
        method: "POST",
        body: {},
        headers: { Origin: "https://elsewhere.test" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/members", {
        method: "POST",
        body: {},
        headers: { "X-CSRF-Token": "wrong" },
      })
    ).status,
    403,
  );
  const member = await call("/api/members", {
    method: "POST",
    body: { barcode: "000NETLIFY", full_name: "Function Test Member" },
  });
  assert.equal(member.status, 201, JSON.stringify(member.data));
  const checkout = {
    memberId: member.data.id,
    kind: "checkout",
    quantity: 2,
    requestId: randomUUID(),
  };
  assert.equal(
    (await call("/api/transactions", { method: "POST", body: checkout })).data
      .currentBalance,
    2,
  );
  assert.equal(
    (
      await call("/.netlify/functions/api/transactions", {
        method: "POST",
        body: checkout,
        use: other,
      })
    ).data.replayed,
    true,
  );
  assert.equal(
    (
      await call("/api/transactions", {
        method: "POST",
        body: {
          ...checkout,
          kind: "return",
          quantity: 1,
          requestId: randomUUID(),
        },
        use: other,
      })
    ).data.currentBalance,
    1,
  );
  const lookup = await call(
    "/.netlify/functions/api/members/lookup?barcode=000NETLIFY&constructor=test&__proto__=test",
    { use: other },
  );
  assert.equal(lookup.data.outstanding, 1);
  assert.equal(lookup.headers.get("cache-control"), "no-store");
  assert.equal((await call("/api/not-real")).status, 404);
});

test("binary Excel multipart uploads survive the Netlify adapter and preserve leading zeros", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Members");
  sheet.addRow(["barcode", "full_name"]);
  sheet.addRow(["000NETLIFY-XLSX", "Excel Function Test"]);
  const form = new FormData();
  form.append(
    "file",
    new Blob([await book.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "members.xlsx",
  );
  const upload = await call("/api/imports", { method: "POST", body: form });
  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  const preview = await call(`/api/imports/${upload.data.id}/preview`, {
    method: "POST",
    body: { mapping: upload.data.mapping },
    use: other,
  });
  assert.equal(preview.data.rows[0].data.barcode, "000NETLIFY-XLSX");
  assert.equal(preview.data.errors, 0);
  assert.equal(
    (await call(`/api/imports/${upload.data.id}/commit`, { method: "POST" }))
      .data.created,
    1,
  );
});

test("5,000 members import in batches with consistent results on concurrent retries", async () => {
  const form = new FormData();
  const lines = [
    "barcode,full_name,phone",
    ...Array.from(
      { length: 5000 },
      (_, i) => `BULK-${String(i).padStart(5, "0")},Bulk Member ${i},`,
    ),
  ];
  form.append("file", new Blob([lines.join("\n")]), "bulk.csv");
  const upload = await call("/api/imports", { method: "POST", body: form });
  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  const preview = await call(`/api/imports/${upload.data.id}/preview`, {
    method: "POST",
    body: { mapping: upload.data.mapping },
  });
  assert.equal(preview.data.total, 5000);
  assert.equal(preview.data.errors, 0);
  const results = await Promise.all([
    call(`/api/imports/${upload.data.id}/commit`, { method: "POST" }),
    call(`/api/imports/${upload.data.id}/commit`, {
      method: "POST",
      use: other,
    }),
  ]);
  for (const result of results)
    assert.deepEqual(result.data, { created: 5000, updated: 0, total: 5000 });
});

test("login throttling persists across function instances and ignores spoofed forwarded addresses", async () => {
  for (let i = 0; i < 20; i++) {
    const result = await call("/api/auth/login", {
      method: "POST",
      session: null,
      ip: "192.0.2.45",
      use: i % 2 ? other : handler,
      body: { email: runtimeConfig.adminEmail, password: "incorrect" },
      headers: { "X-Forwarded-For": `198.51.100.${i + 1}` },
    });
    assert.equal(result.status, 401, JSON.stringify(result.data));
  }
  const blocked = await call("/api/auth/login", {
    method: "POST",
    session: null,
    ip: "192.0.2.45",
    use: instance(),
    body: { email: runtimeConfig.adminEmail, password },
  });
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get("retry-after"));
});

test("Netlify forces production settings and a failed initialization can recover", async () => {
  const config = getNetlifyConfig({
    DATABASE_URL: "postgres://example.test/db",
    APP_ORIGIN: origin + "/",
  });
  assert.equal(config.production, true);
  assert.equal(config.demo, false);
  assert.equal(config.origin, origin);
  assert.equal(config.databaseUrl, "postgres://example.test/db");
  assert.throws(
    () => getNetlifyConfig({ APP_ORIGIN: origin }),
    /DATABASE_URL is required/,
  );
  assert.throws(
    () =>
      getNetlifyConfig({
        DATABASE_URL: "postgres://example.test/db",
        APP_ORIGIN: origin,
        DEMO_MODE: "true",
      }),
    /DEMO_MODE/,
  );
  let attempts = 0;
  const recover = createNetlifyHandler({
    loadConfig: () => {
      if (++attempts === 1) throw new Error("Unavailable");
      return runtimeConfig;
    },
    connect: async () => db,
  });
  assert.equal((await call("/api/health", { use: recover })).status, 503);
  assert.equal((await call("/api/health", { use: recover })).status, 200);
});

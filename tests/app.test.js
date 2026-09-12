import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../server/db.js";
import { createTestDatabase } from "./database.js";
import { migrate } from "../server/migrate.js";
import { createApp } from "../server/app.js";
import {
  bootstrapAdmin,
  provisionInitialAdmin,
  verifyPassword,
} from "../server/auth.js";
import { getConfig } from "../server/config.js";
import { recordTransaction, csvCell } from "../server/domain.js";
import {
  readImportFile,
  validateImport,
  suggestMapping,
} from "../server/imports.js";
import ExcelJS from "exceljs";

let db, server, base, admin, staff, memberId;
const password = "Testing-only-password-482";
const config = getConfig({
  ADMIN_EMAIL: "admin@example.test",
  ADMIN_PASSWORD: password,
  DATA_DIR: "memory://",
  ...(process.env.TEST_DATABASE_URL
    ? { DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: "false" }
    : {}),
});
async function request(
  path,
  {
    method = "GET",
    body,
    auth = admin,
    csrf = true,
    origin = config.origin,
  } = {},
) {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: {
      ...(auth ? { Cookie: auth.cookie } : {}),
      ...(csrf && auth ? { "X-CSRF-Token": auth.csrf } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type");
  const data = contentType?.includes("json")
    ? await response.json()
    : await response.text();
  return { status: response.status, data, headers: response.headers };
}
async function login(email, password) {
  const r = await request("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: null,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return {
    cookie: r.headers.get("set-cookie").split(";")[0],
    csrf: r.data.csrfToken,
    user: r.data.user,
  };
}
before(async () => {
  db = await createTestDatabase(config);
  await migrate(db);
  await migrate(db);
  await bootstrapAdmin(db, config);
  const app = await createApp(db, config);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await login(config.adminEmail, password);
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});

test("private member data requires authentication; CSRF and cross-origin writes are rejected", async () => {
  assert.equal((await request("/members", { auth: null })).status, 401);
  assert.equal(
    (await request("/members", { method: "POST", body: {}, csrf: false }))
      .status,
    403,
  );
  assert.equal(
    (
      await request("/members", {
        method: "POST",
        body: {},
        origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { email: config.adminEmail, password: "wrong" },
        auth: null,
      })
    ).status,
    401,
  );
  const created = await request("/members", {
    method: "POST",
    body: {
      barcode: "001234567890",
      full_name: "Test Member",
      phone: "0500000100",
      membership: "Shapers",
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  memberId = created.data.id;
  assert.equal(created.data.barcode, "001234567890");
  assert.equal(
    (await request("/members/lookup?barcode=001234567890")).data.id,
    memberId,
  );
  assert.equal(
    (await request("/members/lookup?barcode=1234567890")).status,
    404,
  );
});
test("checkout retries are idempotent; conflicting reuse and towel limits cannot change balances", async () => {
  const input = {
    memberId,
    kind: "checkout",
    quantity: 2,
    requestId: randomUUID(),
  };
  const first = await request("/transactions", { method: "POST", body: input });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  const second = await request("/transactions", {
    method: "POST",
    body: input,
  });
  assert.equal(second.data.replayed, true);
  assert.equal(first.data.transaction.id, second.data.transaction.id);
  assert.equal(
    (
      await request("/transactions", {
        method: "POST",
        body: { ...input, quantity: 1 },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/transactions", {
        method: "POST",
        body: { ...input, requestId: randomUUID(), quantity: 5 },
      })
    ).status,
    409,
  );
  assert.equal((await request("/members/" + memberId)).data.outstanding, 2);
});
test("partial returns are allocated oldest first and over-returns roll back completely", async () => {
  await db.query(
    "UPDATE loans SET issued_at=NOW()-INTERVAL '14 hours',due_at=NOW()-INTERVAL '2 hours' WHERE member_id=$1",
    [memberId],
  );
  await recordTransaction(db, admin.user.id, {
    memberId,
    kind: "checkout",
    quantity: 2,
    requestId: randomUUID(),
  });
  const returned = await request("/transactions", {
    method: "POST",
    body: { memberId, kind: "return", quantity: 3, requestId: randomUUID() },
  });
  assert.equal(returned.status, 201, JSON.stringify(returned.data));
  assert.equal(returned.data.transaction.balance_after, 1);
  const profile = (await request("/members/" + memberId)).data;
  assert.equal(profile.outstanding, 1);
  assert.equal(profile.overdue, 0);
  assert.equal(profile.loans.length, 1);
  assert.equal(profile.loans[0].remaining, 1);
  const before = (
    await db.query("SELECT COUNT(*)::int AS count FROM towel_transactions")
  ).rows[0].count;
  assert.equal(
    (
      await request("/transactions", {
        method: "POST",
        body: {
          memberId,
          kind: "return",
          quantity: 2,
          requestId: randomUUID(),
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (await db.query("SELECT COUNT(*)::int AS count FROM towel_transactions"))
      .rows[0].count,
    before,
  );
});
test("two simultaneous returns cannot make a member balance negative", async () => {
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      recordTransaction(db, admin.user.id, {
        memberId,
        kind: "return",
        quantity: 1,
        requestId: randomUUID(),
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal((await request("/members/" + memberId)).data.outstanding, 0);
});
test("inactive members cannot borrow but can still return outstanding towels", async () => {
  await recordTransaction(db, admin.user.id, {
    memberId,
    kind: "checkout",
    quantity: 1,
    requestId: randomUUID(),
  });
  const m = (await request("/members/" + memberId)).data;
  assert.equal(
    (
      await request("/members/" + memberId, {
        method: "PUT",
        body: { ...m, active: false },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/transactions", {
        method: "POST",
        body: {
          memberId,
          kind: "checkout",
          quantity: 1,
          requestId: randomUUID(),
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/transactions", {
        method: "POST",
        body: {
          memberId,
          kind: "return",
          quantity: 1,
          requestId: randomUUID(),
        },
      })
    ).status,
    201,
  );
});
test("reception accounts can transact but cannot import, export, edit members, or change policy", async () => {
  assert.equal(
    (
      await request("/staff", {
        method: "POST",
        body: {
          name: "Reception Test",
          email: "staff@example.test",
          password,
          role: "staff",
        },
      })
    ).status,
    201,
  );
  staff = await login("staff@example.test", password);
  for (const [path, method] of [
    ["/members", "POST"],
    ["/settings", "PUT"],
    ["/imports", "POST"],
    ["/staff", "GET"],
    ["/transactions/export", "GET"],
  ]) {
    assert.equal(
      (
        await request(path, {
          method,
          body: method === "GET" ? undefined : {},
          auth: staff,
        })
      ).status,
      403,
      path,
    );
  }
  assert.equal((await request("/members", { auth: staff })).status, 200);
});
test("CSV import previews and commits atomically, preserves zeros, history and blank optional values", async () => {
  const form = new FormData();
  form.append(
    "file",
    new Blob(
      [
        "barcode,full_name,phone,active\n001234567890,Updated Member,,active\n000098765432,New Member,,active\n",
      ],
      { type: "text/csv" },
    ),
    "members.csv",
  );
  const uploaded = await request("/imports", { method: "POST", body: form });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const preview = await request(`/imports/${uploaded.data.id}/preview`, {
    method: "POST",
    body: { mapping: uploaded.data.mapping },
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.data.updated, 1);
  assert.equal(preview.data.created, 1);
  assert.equal(preview.data.errors, 0);
  const result = await request(`/imports/${uploaded.data.id}/commit`, {
    method: "POST",
  });
  assert.deepEqual(result.data, { created: 1, updated: 1, total: 2 });
  assert.deepEqual(
    (await request(`/imports/${uploaded.data.id}/commit`, { method: "POST" }))
      .data,
    result.data,
  );
  const member = (await request("/members/" + memberId)).data;
  assert.equal(member.full_name, "Updated Member");
  assert.equal(member.phone, "+971500000100");
  assert.ok(member.history.length > 0);
  assert.equal(member.active, true);
  assert.equal(
    (await request("/members/lookup?barcode=000098765432")).status,
    200,
  );
});
test("invalid duplicate import cannot partially insert valid rows", async () => {
  const form = new FormData();
  form.append(
    "file",
    new Blob([
      "barcode,full_name\nVALID-NEW,Valid Name\nDUPLICATE,Name One\nDUPLICATE,Name Two\n",
    ]),
    "invalid.csv",
  );
  const u = (await request("/imports", { method: "POST", body: form })).data;
  const preview = await request(`/imports/${u.id}/preview`, {
    method: "POST",
    body: { mapping: u.mapping },
  });
  assert.equal(preview.data.errors, 1);
  assert.equal(
    (await request(`/imports/${u.id}/commit`, { method: "POST" })).status,
    400,
  );
  assert.equal(
    (await request("/members/lookup?barcode=VALID-NEW")).status,
    404,
  );
});
test("Excel accepts text barcodes and rejects numeric identifiers, formulas, and malformed files", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Members");
  sheet.addRow(["barcode", "full_name"]);
  sheet.addRow(["000123", "Excel Text"]);
  sheet.addRow([123, "Excel Number"]);
  sheet.addRow([{ formula: "1+2", result: 3 }, "Excel Formula"]);
  const raw = await readImportFile({
    originalname: "members.xlsx",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  });
  const rows = validateImport(raw, suggestMapping(raw.headers));
  assert.equal(rows[0].data.barcode, "000123");
  assert.equal(rows[0].errors.length, 0);
  assert.ok(rows[1].errors.some((e) => e.includes("leading zeros")));
  assert.ok(rows[2].errors.some((e) => e.includes("formulas")));
  await assert.rejects(
    readImportFile({
      originalname: "bad.xlsx",
      buffer: Buffer.from("not a workbook"),
    }),
  );
});
test("exports neutralize spreadsheet formulas and invalid filters cannot reach SQL", async () => {
  assert.equal(csvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"');
  assert.equal(csvCell("+123"), '"\'+123"');
  const out = await request("/transactions/export");
  assert.equal(out.status, 200);
  assert.ok(out.data.includes("'+971500000100"));
  assert.equal((await request("/transactions?from=not-a-date")).status, 400);
  assert.equal((await request("/members?q=%27%20OR%201%3D1--")).data.total, 0);
  assert.equal(
    (
      await request("/transactions", {
        method: "POST",
        body: {
          memberId,
          kind: "return",
          quantity: -1,
          requestId: randomUUID(),
        },
      })
    ).status,
    400,
  );
});
test("staff deactivation revokes sessions; production cannot enable demo or use missing database settings", async () => {
  assert.equal(
    (
      await request("/staff/" + staff.user.id, {
        method: "PATCH",
        body: { active: false },
      })
    ).status,
    200,
  );
  assert.equal((await request("/members", { auth: staff })).status, 401);
  assert.equal(
    (await request("/auth/demo", { method: "POST", auth: null, body: {} }))
      .status,
    401,
  );
  assert.throws(() => getConfig({ NODE_ENV: "production" }), /DATABASE_URL/);
  assert.throws(
    () =>
      getConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://localhost/test",
        DEMO_MODE: "true",
      }),
    /DEMO_MODE/,
  );
  assert.throws(
    () =>
      getConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://localhost/test",
        APP_ORIGIN: "http://example.com",
      }),
    /HTTPS/,
  );
  const loggedOut = await request("/auth/logout", { method: "POST" });
  assert.equal(loggedOut.status, 200);
  assert.equal((await request("/members")).status, 401);
});

test("temporary logins must be changed in the app; old sessions and deployment credentials cannot restore access", async () => {
  await db.query("DELETE FROM login_limits");
  await db.query("UPDATE staff SET must_change_password=true WHERE id=$1", [
    admin.user.id,
  ]);
  const first = await login(config.adminEmail, password);
  const second = await login(config.adminEmail, password);
  assert.equal(first.user.mustChangePassword, true);
  assert.equal((await request("/members", { auth: first })).status, 403);
  const account = {
    name: "Desk Owner",
    email: "owner@example.test",
    currentPassword: password,
  };
  const update = (body, options = {}) =>
    request("/auth/account", { method: "PUT", auth: first, body, ...options });
  assert.equal(
    (
      await update(
        { ...account, newPassword: "New-private-password-587" },
        { csrf: false },
      )
    ).status,
    403,
  );
  assert.equal((await update(account)).status, 400);
  assert.equal(
    (
      await update({
        ...account,
        currentPassword: "incorrect",
        newPassword: "New-private-password-587",
      })
    ).status,
    400,
  );
  assert.equal(
    (await update({ ...account, newPassword: password })).status,
    400,
  );
  const changed = await update({
    ...account,
    newPassword: "New-private-password-587",
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(changed.data.user.mustChangePassword, false);
  assert.equal(changed.data.user.email, account.email);
  assert.equal((await request("/auth/me", { auth: first })).status, 401);
  assert.equal((await request("/auth/me", { auth: second })).status, 401);
  const fresh = {
    cookie: changed.headers.get("set-cookie").split(";")[0],
    csrf: changed.data.csrfToken,
    user: changed.data.user,
  };
  assert.equal((await request("/members", { auth: fresh })).status, 200);
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        auth: null,
        body: { email: account.email, password },
      })
    ).status,
    401,
  );
  await login(account.email, "New-private-password-587");
  await bootstrapAdmin(db, config);
  await bootstrapAdmin(db, { demo: false });
  const repeated = await provisionInitialAdmin(db, {
    email: "another@example.test",
    password,
  });
  assert.equal(repeated.created, false);
  assert.equal(
    (await db.query("SELECT id FROM staff WHERE email=$1", [config.adminEmail]))
      .rows.length,
    0,
  );
  const stored = (
    await db.query("SELECT password_hash FROM staff WHERE email=$1", [
      account.email,
    ])
  ).rows[0];
  assert.notEqual(stored.password_hash, "New-private-password-587");
  assert.equal(
    await verifyPassword("New-private-password-587", stored.password_hash),
    true,
  );
  const audit = await db.query(
    "SELECT detail FROM audit_log WHERE action='staff.account.update'",
  );
  assert.equal(
    JSON.stringify(audit.rows).includes("New-private-password-587"),
    false,
  );
});

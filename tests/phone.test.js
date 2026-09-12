import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { createTestDatabase } from "./database.js";
import { migrate } from "../server/migrate.js";
import { createApp } from "../server/app.js";
import { getConfig } from "../server/config.js";
import { bootstrapAdmin } from "../server/auth.js";
import { recordTransaction, undoTransaction } from "../server/domain.js";
import {
  readImportFile,
  validateImport,
  suggestMapping,
} from "../server/imports.js";
import { normalizePhone, phoneSearch } from "../shared/phone.js";

let db, server, base, auth, otherStaff;
const config = getConfig({
  DATA_DIR: "memory://",
  ADMIN_EMAIL: "phone-desk@example.test",
  ADMIN_PASSWORD: "Fictional-test-password-984",
  ...(process.env.TEST_DATABASE_URL
    ? { DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: "false" }
    : {}),
});
async function request(path, method = "GET", body, identity = auth) {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: config.origin,
      ...(identity
        ? { Cookie: identity.cookie, "X-CSRF-Token": identity.csrf }
        : {}),
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = response.headers.get("content-type")?.includes("json")
    ? await response.json()
    : await response.text();
  return { status: response.status, data, headers: response.headers };
}
before(async () => {
  db = await createTestDatabase(config);
  await migrate(db);
  await migrate(db);
  await bootstrapAdmin(db, config);
  server = (await createApp(db, config)).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await request(
    "/auth/login",
    "POST",
    { email: config.adminEmail, password: config.adminPassword },
    null,
  );
  assert.equal(login.status, 200, JSON.stringify(login.data));
  auth = {
    cookie: login.headers.get("set-cookie").split(";")[0],
    csrf: login.data.csrfToken,
    id: login.data.user.id,
  };
  const created = await request("/staff", "POST", {
    name: "Other operator",
    email: "other-operator@example.test",
    password: "Another-test-password-941",
    role: "staff",
  });
  assert.equal(created.status, 201);
  otherStaff = created.data.id;
});
after(async () => {
  await new Promise((done) => server?.close(done));
  await db?.close();
});
async function member(name, phone, extra = {}) {
  const response = await request("/members", "POST", {
    full_name: name,
    phone,
    ...extra,
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data;
}
const find = (q, mode = "phone") =>
  request(`/members/search?mode=${mode}&q=${encodeURIComponent(q)}`);
const profile = async (id) => (await request(`/members/${id}`)).data;
const handover = (id, kind, quantity) =>
  recordTransaction(db, auth.id, {
    memberId: id,
    kind,
    quantity,
    requestId: randomUUID(),
  });
async function preview(csv) {
  const form = new FormData();
  form.append("file", new Blob([csv]), "members.csv");
  const upload = await request("/imports", "POST", form);
  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  const result = await request(`/imports/${upload.data.id}/preview`, "POST", {
    mapping: upload.data.mapping,
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return { ...result.data, id: upload.data.id, mapping: upload.data.mapping };
}
const commit = (id) => request(`/imports/${id}/commit`, "POST");

test("UAE and international numbers normalize without losing their identity", () => {
  for (const value of [
    "050 000 0101",
    "+971 (50) 000-0101",
    "00971500000101",
    "971500000101",
    "500000101",
    "٠٥٠٠٠٠٠١٠١",
    "۰۵۰۰۰۰۰۱۰۱",
  ])
    assert.equal(normalizePhone(value), "+971500000101", value);
  assert.equal(normalizePhone("+44 7700 900123"), "+447700900123");
  assert.equal(normalizePhone("04 000 0101"), "+97140000101");
  for (const invalid of [
    "123",
    "not a phone",
    "+9991234567890",
    "0500000101 ext 2",
    "1e10",
    "=0500000101",
  ])
    assert.equal(normalizePhone(invalid), null, invalid);
  assert.equal(normalizePhone(""), "");
  assert.deepEqual(phoneSearch("0101"), { kind: "suffix", key: "0101" });
  assert.deepEqual(phoneSearch("05000"), { kind: "prefix", key: "9715000" });
  assert.deepEqual(phoneSearch("0500000101"), {
    kind: "exact",
    key: "971500000101",
  });
  assert.equal(phoneSearch("101"), null);
  assert.equal(phoneSearch("%_';--"), null);
});

test("phone lookup returns every shared/suffix match and supports missing phones by name", async () => {
  const first = await member("Avery Phone", "0500001122");
  const second = await member("Blake Phone", "+971550001122");
  const shared = await member("Casey Shared", "00971500001122", {
    active: false,
  });
  for (const number of [
    "0500001122",
    "+971 50 000 1122",
    "00971500001122",
    "٠٥٠٠٠٠١١٢٢",
  ]) {
    const result = (await find(number)).data;
    assert.equal(result.total, 2);
    assert.deepEqual(
      new Set(result.rows.map((row) => row.id)),
      new Set([first.id, shared.id]),
    );
    assert.equal(result.rows[0].active, true);
  }
  const suffix = (await find("1122")).data;
  assert.deepEqual(
    new Set(suffix.rows.map((row) => row.id)),
    new Set([first.id, second.id, shared.id]),
  );
  assert.equal((await find("112")).data.total, 0);
  const legacy = await member("Legacy Without Phone", "", {
    barcode: "0500009876",
  });
  assert.equal(
    (await find("0500009876")).data.total,
    0,
    "Never interpret an old member reference as a phone",
  );
  assert.equal(
    (await find("Legacy Without", "name")).data.rows[0].id,
    legacy.id,
  );
  assert.equal((await find("' OR 1=1--", "name")).data.total, 0);
  assert.equal(
    (await request("/members/search?q=1122", "GET", undefined, null)).status,
    401,
  );
  assert.equal(
    (await request("/members", "POST", { full_name: "Missing number" })).status,
    400,
  );
});

test("editing a number preserves the member ID, internal reference, and towel history", async () => {
  const original = await member("Number Change", "0500002201");
  await handover(original.id, "checkout", 2);
  const saved = await request(`/members/${original.id}`, "PUT", {
    full_name: original.full_name,
    phone: "+44 7700 900124",
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.barcode, original.barcode);
  const after = await profile(original.id);
  assert.equal(after.outstanding, 2);
  assert.equal(after.history.length, 1);
  assert.equal((await find("0500002201")).data.total, 0);
  assert.equal((await find("+447700900124")).data.rows[0].id, original.id);
  assert.equal((await request("/members?q=0097149999999")).status, 200);
  assert.equal(
    (await request("/transactions?kind=checkout&q=%2B447700900124")).data.total,
    1,
  );
});

test("Name and Number CSV import creates then updates safely and keeps omitted values/history", async () => {
  const imported = await preview(
    "Name,Number,Email\nImport Person,0500003301,import@example.test\n",
  );
  assert.equal(imported.mapping.full_name, 0);
  assert.equal(imported.mapping.phone, 1);
  assert.equal(imported.errors, 0);
  const created = await commit(imported.id);
  assert.deepEqual(created.data, { created: 1, updated: 0, total: 1 });
  const original = (await find("0500003301")).data.rows[0];
  await handover(original.id, "checkout", 2);
  const update = await preview(
    "Full name,Mobile,Membership\nimport person,+971500003301,Shapers\n",
  );
  assert.equal(update.updated, 1);
  assert.equal(update.errors, 0);
  assert.deepEqual((await commit(update.id)).data, {
    created: 0,
    updated: 1,
    total: 1,
  });
  assert.deepEqual((await commit(update.id)).data, {
    created: 0,
    updated: 1,
    total: 1,
  });
  const after = await profile(original.id);
  assert.equal(after.barcode, original.barcode);
  assert.equal(after.email, "import@example.test");
  assert.equal(after.membership, "Shapers");
  assert.equal(after.outstanding, 2);
  assert.equal(after.history.length, 1);
});

test("imports flag duplicates, shared phones, different names and missing-phone profiles without merging", async () => {
  const dup = await preview(
    "Name,Phone\nDuplicate One,0500003401\nDuplicate Two,+971500003401\n",
  );
  assert.equal(dup.errors, 1);
  assert.match(dup.errorRows[0].error, /Duplicate phone/);
  assert.equal((await commit(dup.id)).status, 400);
  assert.equal((await find("0500003401")).data.total, 0);
  for (const csv of [
    "Name,Number\nDifferent Import Name,0500003301\n",
    "Name,Phone\nAvery Phone,0500001122\n",
    "Name,Phone\nLegacy Without Phone,0500003402\n",
  ]) {
    const blocked = await preview(csv);
    assert.equal(blocked.errors, 1, csv);
    assert.equal((await commit(blocked.id)).status, 400);
  }
  assert.equal((await find("0500003402")).data.total, 0);
});

test("commit rechecks an import preview if a phone or target member changes", async () => {
  const pending = await preview("Name,Phone\nRace Person,0500003501\n");
  assert.equal(pending.errors, 0);
  const manual = await member("Race Person", "0500003501");
  assert.equal((await commit(pending.id)).status, 409);
  assert.equal((await find("0500003501")).data.total, 1);
  const update = await preview(
    "Name,Phone,Membership\nRace Person,0500003501,Shapers\n",
  );
  await request(`/members/${manual.id}`, "PUT", {
    full_name: manual.full_name,
    phone: "0500003502",
  });
  assert.equal((await commit(update.id)).status, 409);
  assert.equal((await profile(manual.id)).phone, "+971500003502");
});

test("Excel phone import preserves text and rejects numeric cells and formulas", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Members");
  sheet.addRow(["First name", "Last name", "Number"]);
  sheet.addRow(["Excel", "Text", "0500003601"]);
  sheet.addRow(["Excel", "Numeric", 500003602]);
  sheet.addRow([
    "Excel",
    "Formula",
    { formula: '"0500003603"', result: "0500003603" },
  ]);
  const raw = await readImportFile({
    originalname: "members.xlsx",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  });
  const rows = validateImport(raw, suggestMapping(raw.headers));
  assert.equal(rows[0].data.full_name, "Excel Text");
  assert.equal(rows[0].data.phone, "+971500003601");
  assert.equal(rows[0].errors.length, 0);
  assert.ok(
    rows[1].errors.some((error) => error.includes("Phone is a number")),
  );
  assert.ok(rows[2].errors.some((error) => error.includes("formulas")));
});

test("Undo checkout appends one audited correction, retries safely, and fixes totals", async () => {
  const m = await member("Undo Checkout", "0500004101");
  const before = (await request("/dashboard")).data;
  const original = await handover(m.id, "checkout", 3);
  const undoId = randomUUID();
  const first = await request(
    `/transactions/${original.transaction.id}/undo`,
    "POST",
    { requestId: undoId },
  );
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.currentBalance, 0);
  assert.equal(first.data.transaction.reversal_of, original.transaction.id);
  const replay = await request(
    `/transactions/${original.transaction.id}/undo`,
    "POST",
    { requestId: undoId },
  );
  assert.equal(replay.data.replayed, true);
  assert.equal(replay.data.transaction.id, first.data.transaction.id);
  const after = await profile(m.id);
  assert.equal(after.history.length, 2);
  assert.equal(
    after.history.find((row) => row.id === original.transaction.id).corrected,
    true,
  );
  assert.equal(
    (
      await db.query(
        "SELECT id FROM audit_log WHERE action='towel.undo' AND entity_id=$1",
        [first.data.transaction.id],
      )
    ).rows.length,
    1,
  );
  const totals = (await request("/dashboard")).data;
  for (const key of ["outstanding", "issued", "returned"])
    assert.equal(totals[key], before[key], key);
  assert.equal(
    (
      await request(`/transactions/${original.transaction.id}/undo`, "POST", {
        requestId: randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/transactions/${first.data.transaction.id}/undo`, "POST", {
        requestId: randomUUID(),
      })
    ).status,
    409,
  );
  await assert.rejects(
    recordTransaction(db, auth.id, {
      memberId: m.id,
      kind: "return",
      quantity: 3,
      requestId: undoId,
    }),
    { status: 409 },
  );
});

test("Undo partial return restores the same loans and their overdue deadlines", async () => {
  const m = await member("Undo Return", "0500004201");
  await handover(m.id, "checkout", 2);
  await db.query(
    "UPDATE loans SET issued_at=NOW()-INTERVAL '14 hours',due_at=NOW()-INTERVAL '2 hours' WHERE member_id=$1",
    [m.id],
  );
  await handover(m.id, "checkout", 2);
  const before = await profile(m.id);
  const returned = await handover(m.id, "return", 3);
  assert.equal((await profile(m.id)).overdue, 0);
  const corrected = await undoTransaction(
    db,
    auth.id,
    returned.transaction.id,
    randomUUID(),
  );
  assert.equal(corrected.currentBalance, 4);
  const after = await profile(m.id);
  assert.equal(after.overdue, 2);
  const loanState = (data) =>
    data.loans
      .map(({ id, remaining, issued_at, due_at }) => ({
        id,
        remaining,
        issued_at,
        due_at,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(loanState(after), loanState(before));
  await handover(m.id, "return", 4);
  assert.equal((await profile(m.id)).outstanding, 0);
});

test("Undo rejects other staff, expired or superseded movements and concurrent duplicates", async () => {
  const m = await member("Undo Guards", "0500004301");
  const first = await handover(m.id, "checkout", 1);
  await assert.rejects(
    undoTransaction(db, otherStaff, first.transaction.id, randomUUID()),
    { status: 403 },
  );
  const newer = await handover(m.id, "checkout", 1);
  await assert.rejects(
    undoTransaction(db, auth.id, first.transaction.id, randomUUID()),
    { status: 409 },
  );
  const results = await Promise.allSettled(
    [randomUUID(), randomUUID()].map((key) =>
      undoTransaction(db, auth.id, newer.transaction.id, key),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal((await profile(m.id)).outstanding, 1);
  const expired = await handover(m.id, "checkout", 1);
  await db.query(
    "UPDATE towel_transactions SET created_at=NOW()-INTERVAL '6 minutes' WHERE id=$1",
    [expired.transaction.id],
  );
  await assert.rejects(
    undoTransaction(db, auth.id, expired.transaction.id, randomUUID()),
    { status: 409 },
  );
  assert.equal((await profile(m.id)).outstanding, 2);
});

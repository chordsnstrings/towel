import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, memberSchema, audit } from "./domain.js";
import { MAX_IMPORT_BYTES } from "../shared/limits.js";
let activeWorkers = 0;
export const importFields = [
  "barcode",
  "full_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "membership",
  "active",
];
export function suggestMapping(headers) {
  const aliases = {
    barcode: [
      "barcode",
      "memberid",
      "membershipid",
      "cardnumber",
      "cardid",
      "barcodeid",
    ],
    full_name: ["fullname", "name", "membername"],
    first_name: ["firstname", "givenname"],
    last_name: ["lastname", "surname"],
    email: ["email", "emailaddress"],
    phone: ["phone", "mobile", "phonenumber", "mobilenumber"],
    membership: ["membership", "membershiptype", "type", "category"],
    active: ["active", "status"],
  };
  return Object.fromEntries(
    importFields.map((field) => [
      field,
      headers.findIndex((h) =>
        aliases[field].includes(h.toLowerCase().replace(/[^a-z0-9]/g, "")),
      ),
    ]),
  );
}
export async function readImportFile(
  file,
  workerPath = new URL("./import-worker.js", import.meta.url),
) {
  if (file.buffer.length > MAX_IMPORT_BYTES)
    throw new AppError(
      413,
      "Upload one CSV or Excel file, no larger than 4 MB.",
    );
  const extension = file.originalname.split(".").pop().toLowerCase();
  if (!["csv", "xlsx"].includes(extension))
    throw new AppError(400, "Choose a CSV or .xlsx Excel file.");
  if (activeWorkers >= 2)
    throw new AppError(
      503,
      "Another file is being read. Try again in a moment.",
    );
  activeWorkers++;
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { buffer: file.buffer, extension },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        new AppError(
          400,
          "This file took too long to read. Save it as CSV and try again.",
        ),
      );
    }, 20000);
    worker.once("message", (data) => {
      clearTimeout(timer);
      worker.terminate();
      data.error ? reject(new AppError(400, data.error)) : resolve(data);
    });
    worker.once("error", () => {
      clearTimeout(timer);
      reject(
        new AppError(
          400,
          "Could not read this file. Check its format and try again.",
        ),
      );
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      activeWorkers--;
      if (code !== 0)
        reject(
          new AppError(
            400,
            "Could not read this file. Try a smaller CSV file.",
          ),
        );
    });
  });
}
export function validateImport(raw, mapping) {
  z.record(
    z.enum(importFields),
    z
      .number()
      .int()
      .min(-1)
      .max(raw.headers.length - 1),
  ).parse(mapping);
  if (mapping.barcode < 0 || (mapping.full_name < 0 && mapping.first_name < 0))
    throw new AppError(400, "Map the barcode and member name columns.");
  const used = Object.values(mapping).filter((v) => v >= 0);
  if (new Set(used).size !== used.length)
    throw new AppError(400, "Use each column only once.");
  const seen = new Set();
  return raw.records.map((record) => {
    const data = {},
      errors = [];
    for (const field of importFields) {
      if (mapping[field] < 0) continue;
      const cell = record.cells[mapping[field]] || { value: "" };
      if (cell.formula) errors.push(`${field}: replace formulas with values.`);
      if (field === "barcode" && cell.numeric)
        errors.push(
          "Barcode is a number in Excel. Format as Text and restore any missing leading zeros.",
        );
      if (field === "active") {
        const val = cell.value.toLowerCase();
        if (["active", "true", "yes", "1"].includes(val)) data.active = true;
        else if (["inactive", "false", "no", "0"].includes(val))
          data.active = false;
        else if (val) errors.push("Status must be active or inactive.");
      } else if (cell.value || field === "barcode") data[field] = cell.value;
    }
    if (!data.full_name)
      data.full_name = [data.first_name, data.last_name]
        .filter(Boolean)
        .join(" ");
    delete data.first_name;
    delete data.last_name;
    const checked = memberSchema.safeParse(data);
    if (!checked.success)
      errors.push(
        ...checked.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
      );
    if (seen.has(data.barcode)) errors.push("Duplicate barcode in this file.");
    seen.add(data.barcode);
    return { line: record.line, data, errors };
  });
}
export async function commitImport(db, staffId, jobId) {
  return db.transaction(async (tx) => {
    // Imports share a lock so bulk upserts cannot deadlock across function instances.
    if (db.kind === "postgres")
      await tx.query("SELECT pg_advisory_xact_lock(64201902)");
    const job = (
      await tx.query(
        "SELECT * FROM import_jobs WHERE id=$1 AND staff_id=$2 FOR UPDATE",
        [jobId, staffId],
      )
    ).rows[0];
    if (!job)
      throw new AppError(404, "Import not found. Upload the file again.");
    if (job.result) return job.result;
    if (new Date(job.expires_at) < new Date())
      throw new AppError(410, "This preview expired. Upload the file again.");
    if (!job.preview?.length || job.preview.some((row) => row.errors.length))
      throw new AppError(
        400,
        "Fix every row error and preview the import before continuing.",
      );
    let created = 0,
      updated = 0;
    const groups = new Map();
    for (const row of job.preview) {
      const data = memberSchema.parse(row.data);
      // Group by provided optional fields to preserve unmapped/blank existing values.
      const fields = [
        "full_name",
        "email",
        "phone",
        "membership",
        "active",
      ].filter((key) => Object.hasOwn(row.data, key));
      const key = fields.join(",");
      if (!groups.has(key)) groups.set(key, { fields, rows: [] });
      groups.get(key).rows.push({ ...data, id: randomUUID() });
    }
    for (const { fields, rows } of groups.values()) {
      rows.sort((a, b) => a.barcode.localeCompare(b.barcode));
      for (let offset = 0; offset < rows.length; offset += 250) {
        const batch = rows.slice(offset, offset + 250);
        const proposedIds = new Set(batch.map((row) => row.id));
        const saved = await tx.query(
          `INSERT INTO members(id,barcode,full_name,email,phone,membership,active)
           SELECT id,barcode,full_name,email,phone,membership,active
           FROM jsonb_to_recordset($1::jsonb) AS r(id UUID,barcode TEXT,full_name TEXT,email TEXT,phone TEXT,membership TEXT,active BOOLEAN)
           ORDER BY barcode
           ON CONFLICT(barcode) DO UPDATE SET ${fields.map((field) => `${field}=EXCLUDED.${field}`).join(",")},updated_at=NOW()
           RETURNING id`,
          [JSON.stringify(batch)],
        );
        for (const row of saved.rows)
          proposedIds.has(row.id) ? created++ : updated++;
      }
    }
    const result = { created, updated, total: created + updated };
    await tx.query(
      "UPDATE import_jobs SET result=$1,raw_data='{}',preview=NULL WHERE id=$2",
      [JSON.stringify(result), job.id],
    );
    await audit(tx, staffId, "members.import", job.id, result);
    return result;
  });
}

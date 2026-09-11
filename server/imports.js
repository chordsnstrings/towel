import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, memberSchema, audit } from "./domain.js";
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
export async function readImportFile(file) {
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
    const worker = new Worker(new URL("./import-worker.js", import.meta.url), {
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
    for (const row of [...job.preview].sort((a, b) =>
      a.data.barcode.localeCompare(b.data.barcode),
    )) {
      const data = memberSchema.parse(row.data);
      const existing = (
        await tx.query("SELECT id FROM members WHERE barcode=$1 FOR UPDATE", [
          data.barcode,
        ])
      ).rows[0];
      if (existing) {
        const fields = Object.keys(row.data).filter((k) => k !== "barcode");
        await tx.query(
          `UPDATE members SET ${fields.map((k, i) => `${k}=$${i + 1}`).join(",")},updated_at=NOW() WHERE id=$${fields.length + 1}`,
          [...fields.map((k) => data[k]), existing.id],
        );
        updated++;
      } else {
        await tx.query(
          "INSERT INTO members(id,barcode,full_name,email,phone,membership,active) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [
            randomUUID(),
            data.barcode,
            data.full_name,
            data.email,
            data.phone,
            data.membership,
            data.active,
          ],
        );
        created++;
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

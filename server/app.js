import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import {
  authMiddleware,
  adminOnly,
  createSession,
  hashPassword,
  verifyPassword,
} from "./auth.js";
import {
  AppError,
  audit,
  barcodeSchema,
  csvCell,
  memberSchema,
  memberSelect,
  recordTransaction,
} from "./domain.js";
import {
  commitImport,
  readImportFile,
  suggestMapping,
  validateImport,
} from "./imports.js";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
});
const id = (value) => z.uuid().parse(value);
const page = (req) =>
  Math.max(0, Math.min(1000000, Number.parseInt(req.query.offset, 10) || 0));
const limit = 50;
const txSelect =
  "SELECT t.*,m.full_name,m.barcode,m.membership,s.name AS staff_name FROM towel_transactions t JOIN members m ON m.id=t.member_id JOIN staff s ON s.id=t.staff_id";

export async function createApp(db, config) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: config.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "blob:"],
              fontSrc: ["'self'"],
              connectSrc: ["'self'"],
              mediaSrc: ["'self'", "blob:"],
              workerSrc: ["'self'", "blob:"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.use((req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "camera=(self), microphone=(), geolocation=()",
    );
    next();
  });
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", async (req, res, next) => {
    try {
      await db.query("SELECT 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.use("/api", express.json({ limit: "64kb" }));
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("Origin");
      if (
        (origin && origin !== config.origin) ||
        (config.production && !origin)
      )
        return res
          .status(403)
          .json({ error: "This request must come from the towel desk." });
    }
    next();
  });
  app.get("/api/config", (req, res) => res.json({ demo: config.demo }));
  const dummyHash = await hashPassword(randomUUID());
  const loginLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
  });
  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const data = z
      .object({
        email: z.email().max(254),
        password: z.string().min(1).max(200),
      })
      .parse(req.body);
    const user = (
      await db.query("SELECT * FROM staff WHERE email=$1", [
        data.email.toLowerCase().trim(),
      ])
    ).rows[0];
    const valid = await verifyPassword(
      data.password,
      user?.password_hash || dummyHash,
    );
    if (!user?.active || !valid)
      throw new AppError(401, "Email or password is incorrect.");
    const session = await createSession(db, user, res, config);
    await audit(db, user.id, "staff.login", user.id);
    res.json(session);
  });
  if (config.demo)
    app.post("/api/auth/demo", loginLimiter, async (req, res) => {
      const user = (
        await db.query("SELECT * FROM staff WHERE email='demo@move.local'")
      ).rows[0];
      if (!user) throw new AppError(503, "Demo is not ready.");
      res.json(await createSession(db, user, res, config));
    });
  app.use("/api", authMiddleware(db));
  app.get("/api/auth/me", (req, res) =>
    res.json({ user: req.user, csrfToken: req.session.csrf_token }),
  );
  app.post("/api/auth/logout", async (req, res) => {
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [
      req.session.token_hash,
    ]);
    res.clearCookie("move_session", {
      httpOnly: true,
      secure: config.production,
      sameSite: "strict",
      path: "/",
    });
    res.json({ ok: true });
  });
  app.get("/api/settings", async (req, res) =>
    res.json(
      (
        await db.query(
          "SELECT max_outstanding,due_hours FROM settings WHERE id=1",
        )
      ).rows[0],
    ),
  );
  app.put("/api/settings", adminOnly, async (req, res) => {
    const data = z
      .object({
        max_outstanding: z.number().int().min(1).max(50),
        due_hours: z.number().int().min(1).max(168),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      await tx.query(
        "UPDATE settings SET max_outstanding=$1,due_hours=$2 WHERE id=1",
        [data.max_outstanding, data.due_hours],
      );
      await audit(tx, req.user.id, "settings.update", "1", data);
    });
    res.json(data);
  });
  app.get("/api/dashboard", async (req, res) => {
    const daily = (
      await db.query(
        "SELECT COALESCE(SUM(quantity) FILTER (WHERE kind='checkout'),0)::int AS issued,COALESCE(SUM(quantity) FILTER (WHERE kind='return'),0)::int AS returned FROM towel_transactions WHERE (created_at AT TIME ZONE 'Asia/Dubai')::date=(NOW() AT TIME ZONE 'Asia/Dubai')::date",
      )
    ).rows[0];
    const live = (
      await db.query(
        "SELECT COALESCE(SUM(remaining),0)::int AS outstanding,COUNT(DISTINCT member_id)::int AS members_out,COALESCE(SUM(remaining) FILTER(WHERE due_at<NOW()),0)::int AS overdue FROM loans WHERE remaining>0",
      )
    ).rows[0];
    const recent = (
      await db.query(`${txSelect} ORDER BY t.created_at DESC,t.id DESC LIMIT 8`)
    ).rows;
    res.json({ ...daily, ...live, recent });
  });
  app.get("/api/members/lookup", async (req, res) => {
    const barcode = barcodeSchema.parse(req.query.barcode);
    const member = (
      await db.query(`${memberSelect} WHERE m.barcode=$1`, [barcode])
    ).rows[0];
    if (!member)
      throw new AppError(
        404,
        "Barcode not recognised. Find the member by name or add their profile.",
      );
    res.json(member);
  });
  app.get("/api/members", async (req, res) => {
    const q = String(req.query.q || "")
      .trim()
      .slice(0, 160);
    const status = req.query.status;
    const clauses = [
      "(m.full_name ILIKE $1 OR m.barcode ILIKE $1 OR m.phone ILIKE $1 OR m.email ILIKE $1)",
    ];
    if (status === "active") clauses.push("m.active=true");
    if (status === "inactive") clauses.push("m.active=false");
    if (status === "outstanding") clauses.push("COALESCE(l.outstanding,0)>0");
    if (status === "overdue") clauses.push("COALESCE(l.overdue,0)>0");
    const params = ["%" + q.replace(/[\\%_]/g, "\\$&") + "%"];
    const where = " WHERE " + clauses.join(" AND ");
    const base = memberSelect + where;
    const total = (
      await db.query(
        `SELECT COUNT(*)::int AS count FROM (${base}) filtered`,
        params,
      )
    ).rows[0].count;
    const rows = (
      await db.query(
        `${base} ORDER BY ${["outstanding", "overdue"].includes(status) ? "l.due_at ASC," : ""}m.full_name,m.id LIMIT ${limit} OFFSET $2`,
        [...params, page(req)],
      )
    ).rows;
    res.json({ rows, total, offset: page(req), limit });
  });
  app.get("/api/members/:id", async (req, res) => {
    const memberId = id(req.params.id);
    const member = (await db.query(`${memberSelect} WHERE m.id=$1`, [memberId]))
      .rows[0];
    if (!member) throw new AppError(404, "Member not found.");
    const loans = (
      await db.query(
        "SELECT * FROM loans WHERE member_id=$1 AND remaining>0 ORDER BY issued_at,id",
        [memberId],
      )
    ).rows;
    const history = (
      await db.query(
        `${txSelect} WHERE t.member_id=$1 ORDER BY t.created_at DESC,t.id DESC LIMIT 50`,
        [memberId],
      )
    ).rows;
    res.json({ ...member, loans, history });
  });
  app.post("/api/members", adminOnly, async (req, res) => {
    const d = memberSchema.parse(req.body);
    const memberId = randomUUID();
    const member = await db.transaction(async (tx) => {
      const m = (
        await tx.query(
          "INSERT INTO members(id,barcode,full_name,email,phone,membership,active,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            memberId,
            d.barcode,
            d.full_name,
            d.email,
            d.phone,
            d.membership,
            d.active,
            d.notes,
          ],
        )
      ).rows[0];
      await audit(tx, req.user.id, "member.create", memberId);
      return m;
    });
    res.status(201).json(member);
  });
  app.put("/api/members/:id", adminOnly, async (req, res) => {
    const d = memberSchema.parse(req.body);
    const memberId = id(req.params.id);
    const member = await db.transaction(async (tx) => {
      const m = (
        await tx.query(
          "UPDATE members SET barcode=$1,full_name=$2,email=$3,phone=$4,membership=$5,active=$6,notes=$7,updated_at=NOW() WHERE id=$8 RETURNING *",
          [
            d.barcode,
            d.full_name,
            d.email,
            d.phone,
            d.membership,
            d.active,
            d.notes,
            memberId,
          ],
        )
      ).rows[0];
      if (!m) throw new AppError(404, "Member not found.");
      await audit(tx, req.user.id, "member.update", memberId);
      return m;
    });
    res.json(member);
  });
  app.post("/api/transactions", async (req, res) =>
    res.status(201).json(await recordTransaction(db, req.user.id, req.body)),
  );
  function transactionFilter(req) {
    const values = [],
      clauses = [];
    if (req.query.kind && ["checkout", "return"].includes(req.query.kind)) {
      values.push(req.query.kind);
      clauses.push(`t.kind=$${values.length}`);
    }
    for (const [key, operator] of [
      ["from", ">="],
      ["to", "<="],
    ])
      if (req.query[key]) {
        const date = z.iso.date().parse(req.query[key]);
        values.push(date);
        clauses.push(
          `(t.created_at AT TIME ZONE 'Asia/Dubai')::date ${operator} $${values.length}::date`,
        );
      }
    if (req.query.q) {
      values.push(
        "%" +
          String(req.query.q)
            .slice(0, 160)
            .replace(/[\\%_]/g, "\\$&") +
          "%",
      );
      clauses.push(
        `(m.full_name ILIKE $${values.length} OR m.barcode ILIKE $${values.length})`,
      );
    }
    return {
      values,
      where: clauses.length ? " WHERE " + clauses.join(" AND ") : "",
    };
  }
  app.get("/api/transactions", async (req, res) => {
    const { values, where } = transactionFilter(req);
    const offset = page(req);
    const total = (
      await db.query(
        `SELECT COUNT(*)::int AS count FROM (${txSelect + where}) filtered`,
        values,
      )
    ).rows[0].count;
    const rows = (
      await db.query(
        `${txSelect + where} ORDER BY t.created_at DESC,t.id DESC LIMIT ${limit} OFFSET $${values.length + 1}`,
        [...values, offset],
      )
    ).rows;
    res.json({ rows, total, offset, limit });
  });
  app.get("/api/transactions/export", adminOnly, async (req, res) => {
    const { values, where } = transactionFilter(req);
    const rows = (
      await db.query(
        `${txSelect + where} ORDER BY t.created_at DESC,t.id DESC LIMIT 10001`,
        values,
      )
    ).rows;
    if (rows.length > 10000)
      throw new AppError(
        400,
        "Choose a shorter date range to export up to 10,000 transactions.",
      );
    const headers = [
      "Transaction ID",
      "Time (UTC)",
      "Member",
      "Barcode (text)",
      "Action",
      "Towels",
      "Balance after",
      "Staff",
      "Notes",
    ];
    const lines = rows.map((t) =>
      [
        t.id,
        new Date(t.created_at).toISOString(),
        t.full_name,
        "'" + t.barcode,
        t.kind,
        t.quantity,
        t.balance_after,
        t.staff_name,
        t.notes,
      ]
        .map(csvCell)
        .join(","),
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="move-towel-activity.csv"',
    );
    res
      .type("text/csv")
      .send(
        "\uFEFF" + headers.map(csvCell).join(",") + "\r\n" + lines.join("\r\n"),
      );
  });
  app.post(
    "/api/imports",
    adminOnly,
    upload.single("file"),
    async (req, res) => {
      if (!req.file) throw new AppError(400, "Choose a member file.");
      const raw = await readImportFile(req.file),
        jobId = randomUUID();
      await db.query("DELETE FROM import_jobs WHERE expires_at<NOW()");
      await db.query(
        "INSERT INTO import_jobs(id,staff_id,file_name,raw_data,expires_at) VALUES ($1,$2,$3,$4,NOW()+INTERVAL '30 minutes')",
        [
          jobId,
          req.user.id,
          req.file.originalname.slice(0, 200),
          JSON.stringify(raw),
        ],
      );
      res.status(201).json({
        id: jobId,
        headers: raw.headers,
        mapping: suggestMapping(raw.headers),
        total: raw.records.length,
        sample: raw.records.slice(0, 3).map((r) => r.cells.map((c) => c.value)),
      });
    },
  );
  app.post("/api/imports/:id/preview", adminOnly, async (req, res) => {
    const job = (
      await db.query(
        "SELECT * FROM import_jobs WHERE id=$1 AND staff_id=$2 AND expires_at>NOW()",
        [id(req.params.id), req.user.id],
      )
    ).rows[0];
    if (!job || job.result)
      throw new AppError(410, "Upload the file again to start a new preview.");
    const rows = validateImport(job.raw_data, req.body.mapping);
    const existing = (
      await db.query(
        "SELECT barcode FROM members WHERE barcode=ANY($1::text[])",
        [rows.map((r) => r.data.barcode).filter(Boolean)],
      )
    ).rows;
    const known = new Set(existing.map((r) => r.barcode));
    const preview = rows.map((r) => ({
      ...r,
      action: known.has(r.data.barcode) ? "update" : "create",
    }));
    await db.query("UPDATE import_jobs SET preview=$1 WHERE id=$2", [
      JSON.stringify(preview),
      job.id,
    ]);
    res.json({
      rows: preview.slice(0, 100),
      errorRows: preview
        .filter((r) => r.errors.length)
        .map((r) => ({
          line: r.line,
          barcode: r.data.barcode || "",
          error: r.errors.join(" "),
        })),
      total: preview.length,
      errors: preview.filter((r) => r.errors.length).length,
      created: preview.filter((r) => r.action === "create").length,
      updated: preview.filter((r) => r.action === "update").length,
    });
  });
  app.post("/api/imports/:id/commit", adminOnly, async (req, res) =>
    res.json(await commitImport(db, req.user.id, id(req.params.id))),
  );
  app.get("/api/staff", adminOnly, async (req, res) =>
    res.json(
      (
        await db.query(
          "SELECT id,name,email,role,active FROM staff ORDER BY name",
        )
      ).rows,
    ),
  );
  app.post("/api/staff", adminOnly, async (req, res) => {
    const d = z
      .object({
        name: z.string().trim().min(1).max(100),
        email: z.email().max(254),
        password: z.string().min(12).max(200),
        role: z.enum(["staff", "admin"]),
      })
      .parse(req.body);
    const staffId = randomUUID(),
      hash = await hashPassword(d.password);
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO staff(id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,$5)",
        [staffId, d.name, d.email.toLowerCase(), hash, d.role],
      );
      await audit(tx, req.user.id, "staff.create", staffId, { role: d.role });
    });
    res.status(201).json({
      id: staffId,
      name: d.name,
      email: d.email,
      role: d.role,
      active: true,
    });
  });
  app.patch("/api/staff/:id", adminOnly, async (req, res) => {
    const staffId = id(req.params.id);
    if (staffId === req.user.id)
      throw new AppError(400, "You cannot deactivate your own account.");
    const d = z.object({ active: z.boolean() }).parse(req.body);
    const staff = await db.transaction(async (tx) => {
      // Lock every administrator in a stable order. Concurrent deactivations
      // must never leave the gym without an active administrator.
      const admins = (
        await tx.query(
          "SELECT id,active FROM staff WHERE role='admin' ORDER BY id FOR UPDATE",
        )
      ).rows;
      if (
        !d.active &&
        admins.some((a) => a.id === staffId && a.active) &&
        admins.filter((a) => a.active).length <= 1
      )
        throw new AppError(
          409,
          "At least one administrator must remain active.",
        );
      const result = (
        await tx.query(
          "UPDATE staff SET active=$1 WHERE id=$2 RETURNING id,name,email,role,active",
          [d.active, staffId],
        )
      ).rows[0];
      if (!result) throw new AppError(404, "Staff account not found.");
      if (!d.active)
        await tx.query("DELETE FROM sessions WHERE staff_id=$1", [staffId]);
      await audit(tx, req.user.id, "staff.status", staffId, d);
      return result;
    });
    res.json(staff);
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "This endpoint does not exist." }),
  );
  app.use((err, req, res, next) => {
    if (err instanceof ZodError)
      return res
        .status(400)
        .json({ error: err.issues.map((i) => i.message).join(" ") });
    if (err instanceof AppError)
      return res.status(err.status).json({ error: err.message });
    if (err instanceof multer.MulterError)
      return res
        .status(400)
        .json({ error: "Upload one CSV or Excel file, no larger than 5 MB." });
    if (err.code === "23505")
      return res.status(409).json({
        error:
          "That barcode, email, or request already exists. Refresh and try again.",
      });
    if (err.type === "entity.parse.failed")
      return res.status(400).json({ error: "Request body is not valid JSON." });
    if (err.type === "entity.too.large")
      return res.status(413).json({ error: "This request is too large." });
    console.error("Request failed:", err.code || err.name);
    res.status(500).json({
      error: "Could not save or load this information. Please try again.",
    });
  });
  return app;
}

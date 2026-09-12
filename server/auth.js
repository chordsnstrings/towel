import {
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCb);
export const hashToken = (value) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(":");
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}
export async function bootstrapAdmin(db, config) {
  // Once provisioned, the database owns this account. Stale deployment settings
  // must never recreate an old login after the administrator changes their email.
  const existing = await db.query(
    "SELECT id FROM staff WHERE role='admin' AND active=true LIMIT 1",
  );
  if (existing.rows.length || config.demo) return;
  if (!config.adminEmail || !config.adminPassword) {
    throw new Error(
      "Provision the first administrator with npm run setup:admin.",
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.adminEmail))
    throw new Error("Set a valid ADMIN_EMAIL.");
  if (
    config.adminPassword.length < 12 ||
    config.adminPassword.length > 200 ||
    /^(change|replace|example)/i.test(config.adminPassword)
  )
    throw new Error("Use a unique ADMIN_PASSWORD of 12–200 characters.");
  await provisionInitialAdmin(db, {
    email: config.adminEmail,
    password: config.adminPassword,
    temporary: false,
  });
}
export async function provisionInitialAdmin(
  db,
  { email, password, name = "Administrator", temporary = true },
) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new Error("Use a valid administrator email.");
  if (!password || password.length < 12 || password.length > 200)
    throw new Error("Use a password of 12–200 characters.");
  return db.transaction(async (tx) => {
    if (db.kind === "postgres")
      await tx.query("SELECT pg_advisory_xact_lock(64201903)");
    const existing = (
      await tx.query("SELECT id,email FROM staff WHERE role='admin' LIMIT 1")
    ).rows[0];
    if (existing) return { ...existing, created: false };
    const staff = (
      await tx.query(
        "INSERT INTO staff(id,email,name,password_hash,role,must_change_password) VALUES ($1,$2,$3,$4,'admin',$5) RETURNING id,email",
        [
          randomUUID(),
          email.toLowerCase().trim(),
          name,
          await hashPassword(password),
          temporary,
        ],
      )
    ).rows[0];
    await tx.query(
      "INSERT INTO audit_log(staff_id,action,entity_id) VALUES ($1,'staff.provision',$2)",
      [staff.id, staff.id],
    );
    return { ...staff, created: true };
  });
}
export async function createSession(db, staff, res, config) {
  const token = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + config.sessionHours * 3600000);
  await db.query(
    "INSERT INTO sessions(token_hash,staff_id,csrf_token,expires_at) VALUES ($1,$2,$3,$4)",
    [hashToken(token), staff.id, csrfToken, expires],
  );
  await db.query("DELETE FROM sessions WHERE expires_at < NOW()");
  res.cookie("move_session", token, {
    httpOnly: true,
    secure: config.production,
    sameSite: "strict",
    path: "/",
    expires,
  });
  return {
    user: {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      mustChangePassword: !!staff.must_change_password,
    },
    csrfToken,
  };
}
export function authMiddleware(db) {
  return async (req, res, next) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("move_session="))
      ?.slice(13);
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      return res.status(401).json({ error: "Please sign in to continue." });
    const { rows } = await db.query(
      "SELECT s.*,u.name,u.email,u.role,u.active,u.must_change_password FROM sessions s JOIN staff u ON u.id=s.staff_id WHERE token_hash=$1 AND expires_at>NOW()",
      [hashToken(token)],
    );
    const session = rows[0];
    if (!session?.active)
      return res
        .status(401)
        .json({ error: "Your session has ended. Please sign in again." });
    req.user = {
      id: session.staff_id,
      name: session.name,
      email: session.email,
      role: session.role,
      mustChangePassword: !!session.must_change_password,
    };
    req.session = session;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("X-CSRF-Token") !== session.csrf_token
    )
      return res
        .status(403)
        .json({ error: "Refresh this page and try again." });
    next();
  };
}
export const adminOnly = (req, res, next) =>
  req.user.role === "admin"
    ? next()
    : res.status(403).json({ error: "Administrator access is required." });

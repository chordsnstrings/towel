import { createDatabase } from "./db.js";
import { getConfig } from "./config.js";
import { hashPassword } from "./auth.js";
import { audit } from "./domain.js";
// Run in a trusted terminal with a one-time RESET_PASSWORD environment value.
// This intentionally never accepts a password as a command-line argument.
const email = process.argv[2]?.trim().toLowerCase();
const password = process.env.RESET_PASSWORD;
if (!email || !password || password.length < 12 || password.length > 200)
  throw new Error(
    "Provide the staff email argument and RESET_PASSWORD (12–200 characters).",
  );
const db = await createDatabase(getConfig());
try {
  await db.transaction(async (tx) => {
    const user = (
      await tx.query("SELECT id FROM staff WHERE email=$1 FOR UPDATE", [email])
    ).rows[0];
    if (!user) throw new Error("No staff account has this email.");
    await tx.query("UPDATE staff SET password_hash=$1 WHERE id=$2", [
      await hashPassword(password),
      user.id,
    ]);
    await tx.query("DELETE FROM sessions WHERE staff_id=$1", [user.id]);
    await audit(tx, user.id, "staff.password_reset", user.id, {
      source: "console",
    });
  });
  console.log("Password reset. Existing sessions have been signed out.");
} finally {
  await db.close();
}

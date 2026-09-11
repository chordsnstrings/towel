import { randomUUID } from "node:crypto";
import { z } from "zod";
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const barcodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[\x21-\x7E]+$/,
    "Barcode must contain printable characters without spaces.",
  );
export const memberSchema = z.object({
  barcode: barcodeSchema,
  full_name: z.string().trim().min(1, "Member name is required.").max(160),
  email: z.union([z.email().max(254), z.literal("")]).default(""),
  phone: z.string().trim().max(40).default(""),
  membership: z.string().trim().max(80).default("Member"),
  active: z.boolean().default(true),
  notes: z.string().trim().max(1000).default(""),
});
export const transactionSchema = z.object({
  memberId: z.uuid(),
  requestId: z.uuid(),
  kind: z.enum(["checkout", "return"]),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().trim().max(500).default(""),
});
export async function audit(tx, staffId, action, entityId, detail = {}) {
  await tx.query(
    "INSERT INTO audit_log(staff_id,action,entity_id,detail) VALUES ($1,$2,$3,$4)",
    [staffId, action, entityId, JSON.stringify(detail)],
  );
}
export const memberSelect = `SELECT m.*, COALESCE(l.outstanding,0)::int AS outstanding, COALESCE(l.overdue,0)::int AS overdue, l.first_issued_at, l.due_at
  FROM members m LEFT JOIN (SELECT member_id,SUM(remaining) AS outstanding,SUM(CASE WHEN due_at<NOW() THEN remaining ELSE 0 END) AS overdue,MIN(issued_at) AS first_issued_at,MIN(due_at) AS due_at FROM loans WHERE remaining>0 GROUP BY member_id) l ON l.member_id=m.id`;
export async function recordTransaction(db, staffId, input) {
  const data = transactionSchema.parse(input);
  return db.transaction(async (tx) => {
    const member = (
      await tx.query("SELECT * FROM members WHERE id=$1 FOR UPDATE", [
        data.memberId,
      ])
    ).rows[0];
    if (!member) throw new AppError(404, "Member not found.");
    const prior = (
      await tx.query("SELECT * FROM towel_transactions WHERE request_id=$1", [
        data.requestId,
      ])
    ).rows[0];
    if (prior) {
      if (
        prior.member_id !== data.memberId ||
        prior.kind !== data.kind ||
        prior.quantity !== data.quantity ||
        prior.staff_id !== staffId ||
        prior.notes !== data.notes
      )
        throw new AppError(
          409,
          "This request has already been used for a different transaction.",
        );
      const currentBalance = (
        await tx.query(
          "SELECT COALESCE(SUM(remaining),0)::int AS balance FROM loans WHERE member_id=$1",
          [member.id],
        )
      ).rows[0].balance;
      return { transaction: prior, replayed: true, currentBalance };
    }
    const settings = (await tx.query("SELECT * FROM settings WHERE id=1"))
      .rows[0];
    const loans = (
      await tx.query(
        "SELECT * FROM loans WHERE member_id=$1 AND remaining>0 ORDER BY issued_at,id FOR UPDATE",
        [member.id],
      )
    ).rows;
    const balance = loans.reduce((sum, loan) => sum + loan.remaining, 0);
    if (data.kind === "checkout" && !member.active)
      throw new AppError(
        409,
        "This member is inactive. Returns are still accepted.",
      );
    if (
      data.kind === "checkout" &&
      balance + data.quantity > settings.max_outstanding
    )
      throw new AppError(
        409,
        `This member can have at most ${settings.max_outstanding} towels. They currently have ${balance}.`,
      );
    if (data.kind === "return" && data.quantity > balance)
      throw new AppError(
        409,
        `Only ${balance} towel${balance === 1 ? "" : "s"} outstanding. Refresh the member and try again.`,
      );
    const balanceAfter =
      balance + (data.kind === "checkout" ? data.quantity : -data.quantity);
    const id = randomUUID();
    const transaction = (
      await tx.query(
        "INSERT INTO towel_transactions(id,request_id,member_id,staff_id,kind,quantity,balance_after,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          id,
          data.requestId,
          member.id,
          staffId,
          data.kind,
          data.quantity,
          balanceAfter,
          data.notes,
        ],
      )
    ).rows[0];
    if (data.kind === "checkout") {
      await tx.query(
        "INSERT INTO loans(id,member_id,transaction_id,quantity,remaining,due_at) VALUES ($1,$2,$3,$4,$4,NOW()+($5 * INTERVAL '1 hour'))",
        [randomUUID(), member.id, id, data.quantity, settings.due_hours],
      );
    } else {
      let remaining = data.quantity;
      for (const loan of loans) {
        if (!remaining) break;
        const returned = Math.min(remaining, loan.remaining);
        await tx.query(
          "UPDATE loans SET remaining=remaining-$1,returned_at=CASE WHEN remaining=$1 THEN NOW() ELSE NULL END WHERE id=$2",
          [returned, loan.id],
        );
        await tx.query(
          "INSERT INTO return_allocations(return_transaction_id,loan_id,quantity) VALUES ($1,$2,$3)",
          [id, loan.id, returned],
        );
        remaining -= returned;
      }
    }
    await audit(tx, staffId, `towel.${data.kind}`, id, {
      memberId: member.id,
      quantity: data.quantity,
      balanceAfter,
    });
    return { transaction, replayed: false, currentBalance: balanceAfter };
  });
}
export function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

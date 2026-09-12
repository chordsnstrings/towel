import { randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizePhone } from "../shared/phone.js";
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
  barcode: barcodeSchema.optional(),
  full_name: z.string().trim().min(1, "Member name is required.").max(160),
  email: z.union([z.email().max(254), z.literal("")]).default(""),
  phone: z
    .string()
    .trim()
    .max(40)
    .default("")
    .refine(
      (value) => normalizePhone(value) !== null,
      "Enter a complete phone number; include the country code for numbers outside the UAE.",
    )
    .transform((value) => normalizePhone(value)),
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
        prior.reversal_of ||
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
export async function undoTransaction(db, staffId, transactionId, requestId) {
  z.uuid().parse(transactionId);
  z.uuid().parse(requestId);
  return db.transaction(async (tx) => {
    const original = (
      await tx.query("SELECT * FROM towel_transactions WHERE id=$1", [
        transactionId,
      ])
    ).rows[0];
    if (!original) throw new AppError(404, "Movement not found.");
    await tx.query("SELECT id FROM members WHERE id=$1 FOR UPDATE", [
      original.member_id,
    ]);
    const prior = (
      await tx.query("SELECT * FROM towel_transactions WHERE request_id=$1", [
        requestId,
      ])
    ).rows[0];
    const balance = (
      await tx.query(
        "SELECT COALESCE(SUM(remaining),0)::int AS balance FROM loans WHERE member_id=$1",
        [original.member_id],
      )
    ).rows[0].balance;
    if (prior) {
      if (prior.reversal_of !== transactionId || prior.staff_id !== staffId)
        throw new AppError(
          409,
          "This request has already been used for another action.",
        );
      return { transaction: prior, currentBalance: balance, replayed: true };
    }
    if (original.staff_id !== staffId)
      throw new AppError(403, "You can undo only your own handovers.");
    if (original.reversal_of)
      throw new AppError(
        409,
        "A correction cannot be undone. Record the next handover normally.",
      );
    if (
      (
        await tx.query(
          "SELECT id FROM towel_transactions WHERE reversal_of=$1",
          [transactionId],
        )
      ).rows.length
    )
      throw new AppError(409, "This handover has already been corrected.");
    if (Date.now() - new Date(original.created_at).getTime() > 5 * 60000)
      throw new AppError(
        409,
        "The five-minute undo window has ended. Ask the administrator to review the member's history.",
      );
    if (
      (
        await tx.query(
          "SELECT id FROM towel_transactions WHERE member_id=$1 AND sequence>$2 LIMIT 1",
          [original.member_id, original.sequence],
        )
      ).rows.length
    )
      throw new AppError(
        409,
        "This member has a newer towel movement. Refresh their profile before making a correction.",
      );
    const kind = original.kind === "checkout" ? "return" : "checkout";
    const after =
      balance + (kind === "checkout" ? original.quantity : -original.quantity);
    if (after < 0)
      throw new AppError(
        409,
        "The member's balance has changed. Refresh their profile.",
      );
    const correction = (
      await tx.query(
        "INSERT INTO towel_transactions(id,request_id,member_id,staff_id,kind,quantity,balance_after,notes,reversal_of) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [
          randomUUID(),
          requestId,
          original.member_id,
          staffId,
          kind,
          original.quantity,
          after,
          "Correction of the previous handover",
          original.id,
        ],
      )
    ).rows[0];
    if (original.kind === "checkout") {
      const loan = (
        await tx.query(
          "SELECT * FROM loans WHERE transaction_id=$1 FOR UPDATE",
          [original.id],
        )
      ).rows[0];
      if (!loan || loan.remaining !== original.quantity)
        throw new AppError(
          409,
          "These towels have already been returned. Refresh the member.",
        );
      await tx.query(
        "UPDATE loans SET remaining=0,returned_at=NOW() WHERE id=$1",
        [loan.id],
      );
      await tx.query(
        "INSERT INTO return_allocations(return_transaction_id,loan_id,quantity) VALUES ($1,$2,$3)",
        [correction.id, loan.id, original.quantity],
      );
    } else {
      const allocations = (
        await tx.query(
          "SELECT l.*,a.quantity AS restored FROM return_allocations a JOIN loans l ON l.id=a.loan_id WHERE a.return_transaction_id=$1 ORDER BY l.id FOR UPDATE OF l",
          [original.id],
        )
      ).rows;
      if (
        allocations.reduce((sum, row) => sum + row.restored, 0) !==
          original.quantity ||
        allocations.some((row) => row.remaining + row.restored > row.quantity)
      )
        throw new AppError(
          409,
          "The original return cannot be restored safely. Refresh the member.",
        );
      for (const loan of allocations)
        await tx.query(
          "UPDATE loans SET remaining=remaining+$1,returned_at=NULL WHERE id=$2",
          [loan.restored, loan.id],
        );
    }
    await audit(tx, staffId, "towel.undo", correction.id, {
      originalId: original.id,
      memberId: original.member_id,
      quantity: original.quantity,
      balanceAfter: after,
    });
    return { transaction: correction, currentBalance: after, replayed: false };
  });
}
export function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

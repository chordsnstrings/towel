import { randomUUID } from "node:crypto";
import { hashPassword } from "./auth.js";
import { recordTransaction } from "./domain.js";
export async function seedDemo(db) {
  if (
    (await db.query("SELECT id FROM staff WHERE email='demo@move.local'")).rows
      .length
  )
    return;
  const staffId = randomUUID();
  await db.query(
    "INSERT INTO staff(id,name,email,password_hash,role) VALUES ($1,'Demo reception','demo@move.local',$2,'admin')",
    [staffId, await hashPassword(randomUUID())],
  );
  const people = [
    ["DEMO-001", "Alex Morgan", "Shapers", 2],
    ["DEMO-002", "Sam Taylor", "Movers", 1],
    ["DEMO-003", "Jordan Lee", "Shapers", 2],
    ["DEMO-004", "Casey Reed", "Hotel guest", 1],
    ["DEMO-005", "Riley Parker", "Movers", 0],
    ["DEMO-006", "Jamie Wilson", "Shapers", 0],
  ];
  for (const [index, [barcode, name, type, balance]] of people.entries()) {
    const memberId = randomUUID();
    await db.query(
      "INSERT INTO members(id,barcode,full_name,membership,phone) VALUES ($1,$2,$3,$4,$5)",
      [memberId, barcode, name, type, `+97150000010${index + 1}`],
    );
    await recordTransaction(db, staffId, {
      memberId,
      requestId: randomUUID(),
      kind: "checkout",
      quantity: balance || 1,
    });
    if (!balance)
      await recordTransaction(db, staffId, {
        memberId,
        requestId: randomUUID(),
        kind: "return",
        quantity: 1,
      });
  }
  await db.query(
    "UPDATE loans SET issued_at=NOW()-INTERVAL '15 hours',due_at=NOW()-INTERVAL '3 hours' WHERE member_id IN (SELECT id FROM members WHERE barcode='DEMO-003')",
  );
}

// Mission 044 — operator revenue snapshot for Atlas's own plan billing.
//   docker compose exec app node billing-report.mjs        (read-only; never changes data)
import Database from "better-sqlite3";

const raw = process.env.DATABASE_URL ?? "file:/data/atlas.db";
const db = new Database(raw.startsWith("file:") ? raw.slice(5) : raw, { readonly: true });
const kes = (n) => `KSh ${Number(n ?? 0).toLocaleString("en-KE")}`;
const now = new Date().toISOString();
const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

console.log(`Atlas billing report (${now.slice(0, 10)} UTC)\n`);

const subs = db.prepare("SELECT plan, status, COUNT(*) AS n FROM subscriptions GROUP BY plan, status ORDER BY plan, status").all();
console.log("Subscriptions by plan/status:");
for (const r of subs) console.log(`  ${r.plan.padEnd(8)} ${r.status.padEnd(10)} ${r.n}`);

// Estimated MRR: for every live paid subscription, the amount of its most recent paid invoice (so it follows prorated upgrades too).
const mrr = db
  .prepare(
    `SELECT s.plan AS plan, COUNT(*) AS n, COALESCE(SUM(i.amount), 0) AS total
       FROM subscriptions s
       JOIN billing_invoices i ON i.id = (SELECT id FROM billing_invoices WHERE business_id = s.business_id AND status = 'paid' ORDER BY paid_at DESC LIMIT 1)
      WHERE s.status IN ('active', 'past_due') AND s.provider = 'mpesa'
      GROUP BY s.plan`
  )
  .all();
console.log("\nPaying customers (billed through Atlas):");
let total = 0;
for (const r of mrr) {
  total += r.total;
  console.log(`  ${r.plan.padEnd(8)} ${String(r.n).padStart(3)} customers   last paid ${kes(r.total)}`);
}
console.log(`  Estimated monthly recurring revenue: ${kes(total)}`);

const paid30 = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM billing_invoices WHERE status = 'paid' AND paid_at >= ?").get(since30);
console.log(`\nCollected in the last 30 days: ${kes(paid30.total)} across ${paid30.n} invoice(s)`);

const open = db
  .prepare(
    `SELECT b.name AS business, i.kind, i.plan, i.amount, i.due_at, i.attempts, i.payment_state, s.status AS sub_status
       FROM billing_invoices i JOIN businesses b ON b.id = i.business_id LEFT JOIN subscriptions s ON s.business_id = i.business_id
      WHERE i.status = 'open' ORDER BY i.due_at`
  )
  .all();
console.log(`\nOpen invoices: ${open.length}`);
for (const r of open) {
  const overdueDays = Math.floor((Date.now() - new Date(r.due_at).getTime()) / 86_400_000);
  const flag = overdueDays > 0 ? `${overdueDays}d OVERDUE` : `due ${r.due_at.slice(0, 10)}`;
  console.log(`  ${r.business.padEnd(28)} ${r.kind.padEnd(8)} ${r.plan.padEnd(7)} ${kes(r.amount).padStart(12)}  ${flag}  prompts:${r.attempts} (${r.payment_state}) sub:${r.sub_status}`);
}

const lost = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM billing_invoices WHERE status = 'uncollectible' AND updated_at >= ?").get(since30);
console.log(`\nLapsed to the free plan for non-payment (last 30 days): ${lost.n} invoice(s), ${kes(lost.total)} uncollected`);

const dup = db.prepare("SELECT COUNT(*) AS n FROM payment_events WHERE action IN ('billing_duplicate_receipt','billing_callback_amount_mismatch','billing_callback_not_verified') AND created_at >= ?").get(since30.replace("T", " ").slice(0, 19));
console.log(`Billing callbacks refused (duplicate receipt / amount mismatch / not verified) in 30 days: ${dup.n}${dup.n > 0 ? "  <- review payment_events" : ""}`);
db.close();

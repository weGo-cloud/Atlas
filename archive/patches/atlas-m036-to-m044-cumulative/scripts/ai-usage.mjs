// Mission 038 — operator view of today's AI usage (UTC), global and per business, against the configured caps.
//   docker compose exec app node ai-usage.mjs            (add a YYYY-MM-DD argument for another day)
import Database from "better-sqlite3";

const raw = process.env.DATABASE_URL ?? "file:/data/atlas.db";
const db = new Database(raw.startsWith("file:") ? raw.slice(5) : raw, { readonly: true });
const day = process.argv[2] ?? new Date().toISOString().slice(0, 10);

const globalCap = Number.parseInt(process.env.AI_DAILY_CAP_GLOBAL ?? "2000", 10);
const rows = db
  .prepare(
    `SELECT c.scope, c.calls, b.name AS business, s.plan, s.status
       FROM ai_usage_counters c
       LEFT JOIN businesses b ON c.scope = 'biz:' || b.id
       LEFT JOIN subscriptions s ON s.business_id = b.id
      WHERE c.day = ? ORDER BY c.calls DESC`
  )
  .all(day);

const global = rows.find((r) => r.scope === "global")?.calls ?? 0;
console.log(`AI usage for ${day} (UTC)`);
console.log(`  global outbound Anthropic calls: ${global} / ${globalCap}`);
const perBusiness = rows.filter((r) => r.scope.startsWith("biz:"));
if (perBusiness.length === 0) console.log("  no customer-assistant messages counted.");
for (const r of perBusiness) {
  console.log(`  ${(r.business ?? r.scope).padEnd(32)} ${String(r.calls).padStart(5)} msgs   ${r.plan ?? "?"}/${r.status ?? "?"}`);
}
db.close();

// Mission 037 — creates the first real business + owner in a deployed Atlas (there is no
// signup flow, and the dev seeds create a publicly-known account and refuse to run in production).
//
//   docker compose exec app node create-owner.mjs \
//     --email you@shop.co.ke --name "Your Name" --business "Shop Name" \
//     --vertical furniture --plan pro            (add --password to choose one; otherwise generated)
//
// Plain ESM on purpose: it runs inside the production container, which has no TypeScript tooling.
// The password hash format MUST match src/features/auth/lib/password.ts (salt:hash, scrypt, 64 bytes);
// a test signs in through the real AuthService to prove they haven't drifted.
import { randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const VERTICALS = ["auto", "furniture"];
const PLANS = ["starter", "growth", "pro"];

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function createOwner(db, options) {
  const email = String(options.email ?? "").trim().toLowerCase();
  const name = String(options.name ?? "").trim();
  const businessName = String(options.business ?? "").trim();
  const vertical = options.vertical ?? "auto";
  const plan = options.plan ?? "pro";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("A valid --email is required.");
  if (!name) throw new Error("--name is required.");
  if (!businessName) throw new Error("--business is required.");
  if (!VERTICALS.includes(vertical)) throw new Error(`--vertical must be one of: ${VERTICALS.join(", ")}.`);
  if (!PLANS.includes(plan)) throw new Error(`--plan must be one of: ${PLANS.join(", ")}.`);
  if (options.password !== undefined && String(options.password).length < 10) {
    throw new Error("--password must be at least 10 characters.");
  }

  if (db.prepare("SELECT 1 FROM users WHERE lower(email) = ?").get(email)) {
    throw new Error(`A user with ${email} already exists; refusing to overwrite.`);
  }

  const generated = options.password === undefined;
  const password = generated ? randomBytes(15).toString("base64url") : String(options.password);
  const now = new Date().toISOString();
  const businessId = `biz_${randomBytes(6).toString("hex")}`;
  const userId = `user_${randomBytes(6).toString("hex")}`;

  db.transaction(() => {
    db.prepare("INSERT INTO businesses (id, name, vertical, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
      businessId, businessName, vertical, now, now
    );
    db.prepare(
      "INSERT INTO subscriptions (id, business_id, plan, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)"
    ).run(`sub_${randomBytes(6).toString("hex")}`, businessId, plan, now, now);
    db.prepare(
      "INSERT INTO users (id, business_id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'owner', ?, ?)"
    ).run(userId, businessId, name, email, hashPassword(password), now, now);
  })();

  return { businessId, userId, email, plan, vertical, password: generated ? password : null };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    out[arg.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const raw = process.env.DATABASE_URL ?? "file:/data/atlas.db";
    const db = new Database(raw.startsWith("file:") ? raw.slice(5) : raw);
    db.pragma("foreign_keys = ON");
    const created = createOwner(db, parseArgs(process.argv.slice(2)));
    db.close();
    console.log(`Created ${created.vertical} business ${created.businessId} on the ${created.plan} plan.`);
    console.log(`Owner: ${created.email}`);
    if (created.password) console.log(`Temporary password (shown once, change it after signing in): ${created.password}`);
  } catch (error) {
    console.error(`create-owner failed: ${error.message}`);
    process.exitCode = 1;
  }
}

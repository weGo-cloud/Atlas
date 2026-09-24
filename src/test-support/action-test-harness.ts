import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { __clearTestCookies, __setTestCookie } from "./vitest.setup";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "../lib/db/migrations");
const SESSION_COOKIE_NAME = "atlas_session";

export type SeededBusiness = { id: string; name: string };
export type SeededUser = { id: string; businessId: string; email: string; role: "owner" | "staff" };
export type SeededVehicle = { id: string; businessId: string };
export type SeededCustomer = { id: string; businessId: string };
export type SeededLead = { id: string; businessId: string };
export type SeededDeal = { id: string; businessId: string };
export type SeededSale = { id: string; businessId: string };

/**
 * Boots an isolated, migrated SQLite test database per test file and
 * exposes helpers to seed rows and sign in as a real user — producing
 * a genuine session row and cookie, exactly like a real request, so
 * the actual exported server actions can be called directly against
 * it. See vitest.setup.ts for why cookies()/revalidatePath can be
 * faked safely enough to make this possible.
 */
export class ActionTestHarness {
  private readonly testDir: string;
  private readonly dbPath: string;
  private db!: Database.Database;
  private counter = 0;

  constructor() {
    this.testDir = mkdtempSync(path.join(tmpdir(), "atlas-action-test-"));
    this.dbPath = path.join(this.testDir, "test.db");
  }

  /** Creates and migrates the test database. Call once in beforeAll. */
  async setup(): Promise<void> {
    process.env.DATABASE_URL = `file:${this.dbPath}`;
    const setupDb = new Database(this.dbPath);
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
    }
    setupDb.close();
    this.db = new Database(this.dbPath);
  }

  /** Closes the DB and removes the temp directory. Call once in afterAll. */
  teardown(): void {
    this.db.close();
    rmSync(this.testDir, { recursive: true, force: true });
  }

  /** Wipes all tables. Call in beforeEach for test isolation. */
  reset(): void {
    // Mission 018 — `deals` and `activities` added to the wipe list.
    // Neither was strictly necessary to add before now: activities
    // was already emptied indirectly (its rows cascade-delete when
    // their owning lead/customer rows are deleted below), and deals
    // didn't exist. Both are listed explicitly here now for clarity,
    // and because deals.leadId has no cascade of its own (see
    // schema.ts) — it must be cleared before leads or the delete
    // would be blocked by the FK.
    //
    // Mission 019 — `sales` added, cleared first: sales.dealId and
    // sales.customerId both default to RESTRICT (see schema.ts), so
    // any sale row must be gone before deals/customers are deleted.
    this.db.exec(
      "DELETE FROM sales; DELETE FROM sessions; DELETE FROM activities; DELETE FROM deals; DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles; DELETE FROM users; DELETE FROM subscriptions; DELETE FROM businesses;"
    );
    __clearTestCookies();
    this.counter = 0;
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.counter}`;
  }

  /**
   * Mission 028 — also seeds that business's `subscriptions` row, the
   * same way `DatabaseBusinessRepository.create()` does for a real
   * signup, so every test business is observably entitled the moment
   * it exists rather than tripping EntitlementService's "NO_SUBSCRIPTION"
   * fallback. Defaults to "pro" (full access, no vehicle limit) rather
   * than the production default of "starter" — this harness is shared
   * by dozens of unrelated feature tests that have nothing to do with
   * the commercial layer, and giving them an unlimited/fully-entitled
   * plan is the "development-safe default" Mission 028 Section 16
   * explicitly allows, so a limit this mission introduced can't
   * incidentally break unrelated test suites. Tests that specifically
   * exercise plan/limit/entitlement behavior pass their own `plan`.
   */
  seedBusiness(name = "Test Business", plan: "starter" | "growth" | "pro" = "pro"): SeededBusiness {
    const id = this.nextId("biz");
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, name, now, now);
    this.db
      .prepare(
        "INSERT INTO subscriptions (id, business_id, plan, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)"
      )
      .run(`sub_${id}`, id, plan, now, now);
    return { id, name };
  }

  async seedUser(businessId: string, role: "owner" | "staff", email?: string): Promise<SeededUser> {
    const { hashPassword } = await import("../features/auth/lib/password");
    const id = this.nextId("user");
    const now = new Date().toISOString();
    const resolvedEmail = email ?? `${id}@example.com`;
    const passwordHash = await hashPassword("password123");
    this.db
      .prepare(
        "INSERT INTO users (id, business_id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(id, businessId, `Test ${role}`, resolvedEmail, passwordHash, role, now, now);
    return { id, businessId, email: resolvedEmail, role };
  }

  seedVehicle(businessId: string, overrides: Partial<{ stockId: string; status: string }> = {}): SeededVehicle {
    const id = this.nextId("veh");
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO vehicles (id, business_id, make, model, year, stock_id, mileage, price, status, description, added_at, updated_at)
         VALUES (?, ?, 'Toyota', 'Vitz', 2021, ?, 10000, 1000000, ?, 'Test vehicle.', ?, ?)`
      )
      .run(id, businessId, overrides.stockId ?? id, overrides.status ?? "available", now, now);
    return { id, businessId };
  }

  seedCustomer(businessId: string, name = "Test Customer"): SeededCustomer {
    const id = this.nextId("cust");
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO customers (id, business_id, name, phone, email, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', ?, ?)"
      )
      .run(id, businessId, name, "0700000000", `${id}@example.com`, now, now);
    return { id, businessId };
  }

  seedLead(businessId: string, customerId: string, vehicleId: string | null = null): SeededLead {
    const id = this.nextId("lead");
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO leads (id, business_id, customer_id, vehicle_id, vehicle_label, status, source, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, 'new', 'test', '', ?, ?)`
      )
      .run(id, businessId, customerId, vehicleId, now, now);
    return { id, businessId };
  }

  seedDeal(
    businessId: string,
    customerId: string,
    leadId: string,
    overrides: Partial<{ vehicleId: string | null; status: string; agreedPrice: number; depositAmount: number | null }> = {}
  ): SeededDeal {
    const id = this.nextId("deal");
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO deals (id, business_id, customer_id, lead_id, vehicle_id, vehicle_label, status, agreed_price, deposit_amount, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, '', ?, ?)`
      )
      .run(
        id,
        businessId,
        customerId,
        leadId,
        overrides.vehicleId ?? null,
        overrides.status ?? "draft",
        overrides.agreedPrice ?? 1000000,
        overrides.depositAmount ?? null,
        now,
        now
      );
    return { id, businessId };
  }

  seedSale(
    businessId: string,
    dealId: string,
    customerId: string,
    overrides: Partial<{ vehicleId: string | null; saleAmount: number }> = {}
  ): SeededSale {
    const id = this.nextId("sale");
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sales (id, business_id, deal_id, customer_id, vehicle_id, vehicle_label, sale_amount, sold_at, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, '', ?, ?)`
      )
      .run(id, businessId, dealId, customerId, overrides.vehicleId ?? null, overrides.saleAmount ?? 1000000, now, now, now);
    return { id, businessId };
  }

  seedVehiclePhoto(vehicleId: string, position = 0, isPrimary = false): { id: string } {
    const id = this.nextId("photo");
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO vehicle_photos (id, vehicle_id, url, position, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, vehicleId, `/uploads/vehicles/${vehicleId}/${id}.jpg`, position, isPrimary ? 1 : 0, now);
    return { id };
  }

  /**
   * Signs in as the given seeded user through the real signInAction
   * (not a shortcut) and points the mocked cookie jar at the resulting
   * session, so any server action called afterward in this test sees
   * exactly what a real logged-in request would see.
   */
  async signIn(user: SeededUser): Promise<void> {
    const { signInAction } = await import("../features/auth/actions/auth-actions");
    const result = await signInAction(user.email, "password123");
    if (!result.ok) {
      throw new Error(`Test setup failed: sign-in rejected for ${user.email}`);
    }
    const row = this.db
      .prepare("SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(user.id) as { id: string } | undefined;
    if (!row) {
      throw new Error("Test setup failed: no session row found after sign-in");
    }
    __setTestCookie(SESSION_COOKIE_NAME, row.id);
  }

  /** Clears the mocked cookie jar, simulating a signed-out / no-session request. */
  signOut(): void {
    __clearTestCookies();
  }

  /** Points the mocked cookie jar at an arbitrary (possibly invalid/forged) token. */
  setRawSessionCookie(token: string): void {
    __setTestCookie(SESSION_COOKIE_NAME, token);
  }

  row<T>(sql: string, ...args: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...args) as T | undefined;
  }

  rows<T>(sql: string, ...args: unknown[]): T[] {
    return this.db.prepare(sql).all(...args) as T[];
  }

  /** Runs an arbitrary mutating statement directly against the test DB (e.g. to simulate an expired session). */
  run(sql: string, ...args: unknown[]): void {
    this.db.prepare(sql).run(...args);
  }
}

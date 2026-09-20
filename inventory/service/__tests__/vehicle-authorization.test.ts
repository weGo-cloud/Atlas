import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AuthService as AuthServiceClass } from "../../../auth/service/auth-service";
import type { DatabaseBusinessRepository as BusinessRepoClass } from "../../../auth/repository/database-business-repository";
import type { DatabaseSessionRepository as SessionRepoClass } from "../../../auth/repository/database-session-repository";
import type { DatabaseUserRepository as UserRepoClass } from "../../../auth/repository/database-user-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../repository/database-vehicle-repository";
import type { VehicleService as VehicleServiceClass } from "../vehicle-service";
import type { CurrentSession } from "../../../auth/lib/current-session";

/**
 * Proves the Mission 013 authorization design end to end against a
 * real DB-backed session — not a mock — for exactly the flow every
 * server action follows:
 *
 *   requireCurrentSession() → requirePermission() → Service
 *
 * We can't call the exported "use server" action functions directly
 * in this harness (they depend on next/headers cookies(), which
 * requires a real Next.js request context — true for every action in
 * this codebase since Mission 001, which is why no action has ever
 * been unit-tested directly). Instead this test builds the identical
 * {user, business} shape requireCurrentSession() would have produced,
 * by going through the same AuthService.signIn() every real sign-in
 * uses, and then runs the same two-step check + service call an
 * action body performs. This proves the real objects and real logic,
 * not a stand-in.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-authz-db-"));
const testDbPath = path.join(testDir, "test.db");

let AuthService: typeof AuthServiceClass;
let DatabaseUserRepository: typeof UserRepoClass;
let DatabaseSessionRepository: typeof SessionRepoClass;
let DatabaseBusinessRepository: typeof BusinessRepoClass;
let DatabaseVehicleRepository: typeof VehicleRepoClass;
let VehicleService: typeof VehicleServiceClass;
let hashPassword: (password: string) => Promise<string>;
let requirePermission: (session: CurrentSession, permission: "vehicle.delete") => void;
let ForbiddenError: new (message?: string) => Error;
let rawDb: Database.Database;

const BUSINESS_A = "biz_authz_a";
const BUSINESS_B = "biz_authz_b";

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  setupDb.close();

  const authServiceModule = await import("../../../auth/service/auth-service");
  const userRepoModule = await import("../../../auth/repository/database-user-repository");
  const sessionRepoModule = await import("../../../auth/repository/database-session-repository");
  const businessRepoModule = await import("../../../auth/repository/database-business-repository");
  const passwordModule = await import("../../../auth/lib/password");
  const permissionsModule = await import("../../../auth/domain/permissions");
  const vehicleRepoModule = await import("../../repository/database-vehicle-repository");
  const vehicleServiceModule = await import("../vehicle-service");

  AuthService = authServiceModule.AuthService;
  DatabaseUserRepository = userRepoModule.DatabaseUserRepository;
  DatabaseSessionRepository = sessionRepoModule.DatabaseSessionRepository;
  DatabaseBusinessRepository = businessRepoModule.DatabaseBusinessRepository;
  DatabaseVehicleRepository = vehicleRepoModule.DatabaseVehicleRepository;
  VehicleService = vehicleServiceModule.VehicleService;
  hashPassword = passwordModule.hashPassword;
  requirePermission = permissionsModule.requirePermission;
  ForbiddenError = permissionsModule.ForbiddenError;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

async function seedUser(businessId: string, role: "owner" | "staff", email: string) {
  const now = new Date().toISOString();
  const passwordHash = await hashPassword("password123");
  const userId = `user_${businessId}_${role}`;
  rawDb
    .prepare(
      "INSERT INTO users (id, business_id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(userId, businessId, `Test ${role}`, email, passwordHash, role, now, now);
  return userId;
}

function seedVehicle(businessId: string, stockId: string) {
  const now = new Date().toISOString();
  const id = `veh_${stockId}`;
  rawDb
    .prepare(
      `INSERT INTO vehicles (id, business_id, make, model, year, stock_id, mileage, price, status, description, added_at, updated_at)
       VALUES (?, ?, 'Toyota', 'Vitz', 2021, ?, 10000, 1000000, 'available', 'Authz test vehicle.', ?, ?)`
    )
    .run(id, businessId, stockId, now, now);
  return id;
}

/**
 * Mirrors exactly what deleteVehicleAction does: authorize against
 * the session, then call the business-scoped service. Used by every
 * test below so the assertions exercise the production code path,
 * not a reimplementation of it.
 */
async function attemptDeleteAsAction(session: CurrentSession, vehicleId: string) {
  try {
    requirePermission(session, "vehicle.delete");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false as const, code: "FORBIDDEN" as const };
    }
    throw error;
  }
  const repository = new DatabaseVehicleRepository(session.business.id);
  const service = new VehicleService(repository);
  const result = await service.deleteVehicle(vehicleId);
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, code: result.error.code };
}

describe("Vehicle deletion authorization (Mission 013)", () => {
  let auth: InstanceType<typeof AuthServiceClass>;

  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM sessions; DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM vehicles; DELETE FROM users; DELETE FROM businesses;"
    );
    const now = new Date().toISOString();
    rawDb
      .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(BUSINESS_A, "Business A", now, now);
    rawDb
      .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(BUSINESS_B, "Business B", now, now);

    auth = new AuthService(
      new DatabaseUserRepository(),
      new DatabaseSessionRepository(),
      new DatabaseBusinessRepository()
    );
  });

  it("owner can delete a vehicle in their own business", async () => {
    await seedUser(BUSINESS_A, "owner", "owner-a@example.com");
    const vehicleId = seedVehicle(BUSINESS_A, "OWNER-DEL-1");

    const signIn = await auth.signIn("owner-a@example.com", "password123");
    if (!signIn.ok) throw new Error("sign-in failed");
    const session: CurrentSession = { user: signIn.data.user, business: signIn.data.business };

    const outcome = await attemptDeleteAsAction(session, vehicleId);
    expect(outcome.ok).toBe(true);

    const row = rawDb.prepare("SELECT id FROM vehicles WHERE id = ?").get(vehicleId);
    expect(row).toBeUndefined();
  });

  it("staff is rejected before the service/repository is ever reached", async () => {
    await seedUser(BUSINESS_A, "staff", "staff-a@example.com");
    const vehicleId = seedVehicle(BUSINESS_A, "STAFF-DEL-1");

    const signIn = await auth.signIn("staff-a@example.com", "password123");
    if (!signIn.ok) throw new Error("sign-in failed");
    const session: CurrentSession = { user: signIn.data.user, business: signIn.data.business };

    const outcome = await attemptDeleteAsAction(session, vehicleId);
    expect(outcome).toEqual({ ok: false, code: "FORBIDDEN" });

    // The vehicle must still exist — proves the repository was never
    // called, not merely that the delete "failed" for some other reason.
    const row = rawDb.prepare("SELECT id FROM vehicles WHERE id = ?").get(vehicleId);
    expect(row).toBeDefined();
  });

  it("owner of business A cannot delete a vehicle belonging to business B (isolation holds independently of role)", async () => {
    await seedUser(BUSINESS_A, "owner", "owner-a2@example.com");
    const otherBusinessVehicleId = seedVehicle(BUSINESS_B, "CROSS-BIZ-1");

    const signIn = await auth.signIn("owner-a2@example.com", "password123");
    if (!signIn.ok) throw new Error("sign-in failed");
    const session: CurrentSession = { user: signIn.data.user, business: signIn.data.business };

    // requirePermission passes (owner has vehicle.delete) — but the
    // service is scoped to Business A's repository, so it can't see
    // or touch Business B's vehicle. Authorization and tenant
    // isolation are independent protections; this proves the second
    // one isn't accidentally bypassed by the first.
    const outcome = await attemptDeleteAsAction(session, otherBusinessVehicleId);
    expect(outcome).toEqual({ ok: false, code: "NOT_FOUND" });

    const row = rawDb.prepare("SELECT id FROM vehicles WHERE id = ?").get(otherBusinessVehicleId);
    expect(row).toBeDefined();
  });

  it("staff of business A is rejected for a business B vehicle too (both protections stack)", async () => {
    await seedUser(BUSINESS_A, "staff", "staff-a2@example.com");
    const otherBusinessVehicleId = seedVehicle(BUSINESS_B, "CROSS-BIZ-2");

    const signIn = await auth.signIn("staff-a2@example.com", "password123");
    if (!signIn.ok) throw new Error("sign-in failed");
    const session: CurrentSession = { user: signIn.data.user, business: signIn.data.business };

    const outcome = await attemptDeleteAsAction(session, otherBusinessVehicleId);
    expect(outcome).toEqual({ ok: false, code: "FORBIDDEN" });
  });
});

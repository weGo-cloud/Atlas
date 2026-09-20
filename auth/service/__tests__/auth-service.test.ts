import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AuthService as AuthServiceClass } from "../auth-service";
import type { DatabaseBusinessRepository as BusinessRepoClass } from "../../repository/database-business-repository";
import type { DatabaseSessionRepository as SessionRepoClass } from "../../repository/database-session-repository";
import type { DatabaseUserRepository as UserRepoClass } from "../../repository/database-user-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-auth-db-"));
const testDbPath = path.join(testDir, "test.db");

let AuthService: typeof AuthServiceClass;
let DatabaseUserRepository: typeof UserRepoClass;
let DatabaseSessionRepository: typeof SessionRepoClass;
let DatabaseBusinessRepository: typeof BusinessRepoClass;
let hashPassword: (password: string) => Promise<string>;
let rawDb: Database.Database;

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  setupDb.close();

  const serviceModule = await import("../auth-service");
  const userRepoModule = await import("../../repository/database-user-repository");
  const sessionRepoModule = await import("../../repository/database-session-repository");
  const businessRepoModule = await import("../../repository/database-business-repository");
  const passwordModule = await import("../../lib/password");
  AuthService = serviceModule.AuthService;
  DatabaseUserRepository = userRepoModule.DatabaseUserRepository;
  DatabaseSessionRepository = sessionRepoModule.DatabaseSessionRepository;
  DatabaseBusinessRepository = businessRepoModule.DatabaseBusinessRepository;
  hashPassword = passwordModule.hashPassword;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

async function seedBusinessAndUser(businessId: string, email: string, password: string) {
  const now = new Date().toISOString();
  rawDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(businessId, "Test Dealership", now, now);
  const passwordHash = await hashPassword(password);
  const userId = `user_${businessId}`;
  rawDb
    .prepare(
      "INSERT INTO users (id, business_id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(userId, businessId, "Test Owner", email, passwordHash, "owner", now, now);
  return userId;
}

describe("AuthService", () => {
  let service: InstanceType<typeof AuthServiceClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM sessions; DELETE FROM users; DELETE FROM businesses;");
    service = new AuthService(
      new DatabaseUserRepository(),
      new DatabaseSessionRepository(),
      new DatabaseBusinessRepository()
    );
  });

  describe("signIn", () => {
    it("succeeds with correct email and password", async () => {
      await seedBusinessAndUser("biz_a", "owner@a.test", "correct-password");

      const result = await service.signIn("owner@a.test", "correct-password");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.token).toBeTruthy();
        expect(result.data.user.email).toBe("owner@a.test");
        expect(result.data.business.id).toBe("biz_a");
      }
    });

    it("is case-insensitive on email", async () => {
      await seedBusinessAndUser("biz_b", "owner@b.test", "correct-password");
      const result = await service.signIn("OWNER@B.TEST", "correct-password");
      expect(result.ok).toBe(true);
    });

    it("rejects an unknown email", async () => {
      const result = await service.signIn("nobody@nowhere.test", "whatever");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("rejects a wrong password", async () => {
      await seedBusinessAndUser("biz_c", "owner@c.test", "correct-password");
      const result = await service.signIn("owner@c.test", "wrong-password");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("gives an identical error message for unknown email vs wrong password (no user enumeration)", async () => {
      await seedBusinessAndUser("biz_d", "owner@d.test", "correct-password");
      const unknownEmail = await service.signIn("nobody@nowhere.test", "whatever");
      const wrongPassword = await service.signIn("owner@d.test", "wrong-password");

      expect(!unknownEmail.ok && !wrongPassword.ok).toBe(true);
      if (!unknownEmail.ok && !wrongPassword.ok) {
        expect(unknownEmail.error.message).toBe(wrongPassword.error.message);
      }
    });

    it("creates a real, resolvable session on success", async () => {
      await seedBusinessAndUser("biz_e", "owner@e.test", "correct-password");
      const signInResult = await service.signIn("owner@e.test", "correct-password");
      if (!signInResult.ok) throw new Error("setup failed");

      const resolved = await service.getSessionUser(signInResult.data.token);
      expect(resolved).not.toBeNull();
      expect(resolved?.user.email).toBe("owner@e.test");
    });
  });

  describe("getSessionUser", () => {
    it("returns null for an unknown token", async () => {
      const result = await service.getSessionUser("not-a-real-token");
      expect(result).toBeNull();
    });

    it("returns null and deletes the session for an expired token", async () => {
      await seedBusinessAndUser("biz_f", "owner@f.test", "correct-password");
      const signInResult = await service.signIn("owner@f.test", "correct-password");
      if (!signInResult.ok) throw new Error("setup failed");

      // Force the session's expiresAt into the past.
      rawDb
        .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
        .run(new Date(Date.now() - 1000).toISOString(), signInResult.data.token);

      const result = await service.getSessionUser(signInResult.data.token);
      expect(result).toBeNull();

      // Confirm it was actually cleaned up, not just treated as expired.
      const stillThere = rawDb
        .prepare("SELECT * FROM sessions WHERE id = ?")
        .get(signInResult.data.token);
      expect(stillThere).toBeUndefined();
    });
  });

  describe("signOut", () => {
    it("invalidates the session so it no longer resolves", async () => {
      await seedBusinessAndUser("biz_g", "owner@g.test", "correct-password");
      const signInResult = await service.signIn("owner@g.test", "correct-password");
      if (!signInResult.ok) throw new Error("setup failed");

      await service.signOut(signInResult.data.token);

      const resolved = await service.getSessionUser(signInResult.data.token);
      expect(resolved).toBeNull();
    });

    it("does not throw when signing out a token that doesn't exist", async () => {
      await expect(service.signOut("not-a-real-token")).resolves.not.toThrow();
    });
  });
});

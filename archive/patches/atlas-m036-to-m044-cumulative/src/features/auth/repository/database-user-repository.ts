import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { users, type UserRow } from "@/lib/db/schema";
import type { User, UserRole } from "../domain/user";
import type { UserRepository } from "./user-repository";

export class DatabaseUserRepository implements UserRepository {
  async getById(id: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async getByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async getCredentialsByEmail(
    email: string
  ): Promise<{ user: User; passwordHash: string } | null> {
    const normalized = email.trim().toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { user: toUser(row), passwordHash: row.passwordHash };
  }

  async create(input: {
    businessId: string;
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<User> {
    const now = new Date().toISOString();
    const id = generateId();

    await db.insert(users).values({
      id,
      businessId: input.businessId,
      name: input.name,
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.getById(id);
    if (!created) throw new Error("Failed to read back newly created user.");
    return created;
  }

  async getByIdsForBusiness(ids: string[], businessId: string): Promise<User[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select()
      .from(users)
      .where(and(inArray(users.id, ids), eq(users.businessId, businessId)));
    return rows.map(toUser);
  }
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    email: row.email,
    role: row.role as UserRole,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `user_${Date.now().toString(36)}${counter.toString(36)}`;
}

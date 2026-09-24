import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { sessions, users, type SessionRow, type UserRow } from "@/lib/db/schema";
import type { Session } from "../domain/session";
import type { User, UserRole } from "../domain/user";
import type { SessionRepository } from "./session-repository";

export class DatabaseSessionRepository implements SessionRepository {
  async create(input: { userId: string; expiresAt: string }): Promise<Session> {
    // 32 random bytes (256 bits) hex-encoded — the token itself is the
    // primary key and the only thing that resolves to a session, so
    // it needs to be unguessable, not just unique.
    const id = randomBytes(32).toString("hex");
    const now = new Date().toISOString();

    await db.insert(sessions).values({
      id,
      userId: input.userId,
      expiresAt: input.expiresAt,
      createdAt: now,
    });

    return { id, userId: input.userId, expiresAt: input.expiresAt, createdAt: now };
  }

  async getWithUser(
    token: string
  ): Promise<{ session: Session; user: User } | null> {
    const rows = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, token))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return { session: toSession(row.session), user: toUser(row.user) };
  }

  async delete(token: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, token));
  }
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
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

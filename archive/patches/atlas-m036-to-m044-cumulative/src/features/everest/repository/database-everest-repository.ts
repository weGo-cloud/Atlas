import { and, asc, desc, eq, gte, lte, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  everestAuditLog,
  everestConversations,
  everestMessages,
  everestPendingActions,
  type EverestConversationRow,
  type EverestMessageRow,
  type EverestPendingActionRow,
} from "@/lib/db/schema-everest";
import type { ChangeLine, ChatMessage, Conversation, PendingAction, WriteToolName } from "../domain/types";
import type { EverestRepository, NewAuditEntry, NewPendingAction, RecordMessageResult } from "./everest-repository";

let counter = 0;
function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${counter.toString(36)}`;
}

function toConversation(row: EverestConversationRow): Conversation {
  return { id: row.id, businessId: row.businessId, userId: row.userId, title: row.title, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

function toMessage(row: EverestMessageRow): ChatMessage {
  return { id: row.id, conversationId: row.conversationId, role: row.role === "assistant" ? "assistant" : "user", content: row.content, createdAt: row.createdAt };
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toPending(row: EverestPendingActionRow): PendingAction {
  return {
    id: row.id,
    businessId: row.businessId,
    userId: row.userId,
    conversationId: row.conversationId,
    messageId: row.messageId,
    toolName: row.toolName as WriteToolName,
    args: parseJson<Record<string, unknown>>(row.argsJson, {}),
    summary: row.summary,
    changes: parseJson<ChangeLine[]>(row.changesJson, []),
    status: (["pending", "confirmed", "cancelled", "expired"] as const).find((s) => s === row.status) ?? "expired",
    resultOk: row.resultOk,
    resultMessage: row.resultMessage,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    resolvedAt: row.resolvedAt,
  };
}

export class DatabaseEverestRepository implements EverestRepository {
  constructor(private readonly businessId: string) {}

  async createConversation(userId: string, title: string, now: string): Promise<Conversation> {
    const id = generateId("aconv");
    await db.insert(everestConversations).values({ id, businessId: this.businessId, userId, title, createdAt: now, updatedAt: now });
    const created = await this.getConversation(userId, id);
    if (!created) throw new Error("Failed to read back newly created conversation.");
    return created;
  }

  async getConversation(userId: string, conversationId: string): Promise<Conversation | null> {
    const rows = await db
      .select()
      .from(everestConversations)
      .where(
        and(
          eq(everestConversations.id, conversationId),
          eq(everestConversations.businessId, this.businessId),
          eq(everestConversations.userId, userId)
        )
      )
      .limit(1);
    return rows[0] ? toConversation(rows[0]) : null;
  }

  async getLatestConversation(userId: string): Promise<Conversation | null> {
    const rows = await db
      .select()
      .from(everestConversations)
      .where(and(eq(everestConversations.businessId, this.businessId), eq(everestConversations.userId, userId)))
      .orderBy(desc(everestConversations.updatedAt), desc(everestConversations.id))
      .limit(1);
    return rows[0] ? toConversation(rows[0]) : null;
  }

  async touchConversation(conversationId: string, now: string, title?: string): Promise<void> {
    await db
      .update(everestConversations)
      .set({ updatedAt: now, ...(title ? { title } : {}) })
      .where(and(eq(everestConversations.id, conversationId), eq(everestConversations.businessId, this.businessId)));
  }

  async recordUserMessageWithinLimits(input: {
    userId: string;
    conversationId: string;
    content: string;
    now: string;
    monthStart: string;
    monthlyLimit: number | null;
    rateWindowStart: string;
    rateLimit: number;
  }): Promise<RecordMessageResult> {
    const businessId = this.businessId;
    // Synchronous transaction, no `await` between the counts and the insert: nothing else can run on this process in between, and SQLite serializes writers across processes. Same guard as createWithinLimit (M029 Section 14).
    const outcome = db.transaction((tx) => {
      const monthUsed =
        tx
          .select({ n: sql<number>`count(*)` })
          .from(everestMessages)
          .where(
            and(
              eq(everestMessages.businessId, businessId),
              eq(everestMessages.role, "user"),
              gte(everestMessages.createdAt, input.monthStart)
            )
          )
          .get()?.n ?? 0;

      const recent =
        tx
          .select({ n: sql<number>`count(*)` })
          .from(everestMessages)
          .where(
            and(
              eq(everestMessages.businessId, businessId),
              eq(everestMessages.userId, input.userId),
              eq(everestMessages.role, "user"),
              gte(everestMessages.createdAt, input.rateWindowStart)
            )
          )
          .get()?.n ?? 0;

      if (input.monthlyLimit !== null && monthUsed >= input.monthlyLimit) {
        return { recorded: false as const, reason: "LIMIT_REACHED" as const, used: monthUsed };
      }
      if (recent >= input.rateLimit) {
        return { recorded: false as const, reason: "RATE_LIMITED" as const, used: monthUsed };
      }

      const id = generateId("amsg");
      tx.insert(everestMessages)
        .values({
          id,
          businessId,
          userId: input.userId,
          conversationId: input.conversationId,
          role: "user",
          content: input.content,
          createdAt: input.now,
        })
        .run();
      return { recorded: true as const, id };
    });

    if (!outcome.recorded) return outcome;
    return {
      recorded: true,
      message: { id: outcome.id, conversationId: input.conversationId, role: "user", content: input.content, createdAt: input.now },
    };
  }

  async addEverestMessage(userId: string, conversationId: string, content: string, now: string): Promise<ChatMessage> {
    const id = generateId("amsg");
    await db.insert(everestMessages).values({ id, businessId: this.businessId, userId, conversationId, role: "assistant", content, createdAt: now });
    return { id, conversationId, role: "assistant", content, createdAt: now };
  }

  async listMessages(conversationId: string, limit: number): Promise<ChatMessage[]> {
    const rows = await db
      .select()
      .from(everestMessages)
      .where(and(eq(everestMessages.conversationId, conversationId), eq(everestMessages.businessId, this.businessId)))
      .orderBy(desc(everestMessages.createdAt), desc(everestMessages.id))
      .limit(limit);
    return rows.map(toMessage).reverse();
  }

  async countUserMessagesSince(monthStart: string): Promise<number> {
    const row = await db
      .select({ n: sql<number>`count(*)` })
      .from(everestMessages)
      .where(
        and(
          eq(everestMessages.businessId, this.businessId),
          eq(everestMessages.role, "user"),
          gte(everestMessages.createdAt, monthStart)
        )
      )
      .get();
    return row?.n ?? 0;
  }

  async createPendingAction(input: NewPendingAction): Promise<PendingAction> {
    const id = generateId("apend");
    await db.insert(everestPendingActions).values({
      id,
      businessId: this.businessId,
      userId: input.userId,
      conversationId: input.conversationId,
      toolName: input.toolName,
      argsJson: JSON.stringify(input.args),
      summary: input.summary,
      changesJson: JSON.stringify(input.changes),
      status: "pending",
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    });
    const created = await this.getPendingAction(input.userId, id);
    if (!created) throw new Error("Failed to read back newly created pending action.");
    return created;
  }

  async getPendingAction(userId: string, id: string): Promise<PendingAction | null> {
    const rows = await db
      .select()
      .from(everestPendingActions)
      .where(
        and(
          eq(everestPendingActions.id, id),
          eq(everestPendingActions.businessId, this.businessId),
          eq(everestPendingActions.userId, userId)
        )
      )
      .limit(1);
    return rows[0] ? toPending(rows[0]) : null;
  }

  async listPendingActions(conversationId: string): Promise<PendingAction[]> {
    const rows = await db
      .select()
      .from(everestPendingActions)
      .where(and(eq(everestPendingActions.conversationId, conversationId), eq(everestPendingActions.businessId, this.businessId)))
      .orderBy(asc(everestPendingActions.createdAt), asc(everestPendingActions.id));
    return rows.map(toPending);
  }

  async attachPendingActionsToMessage(pendingActionIds: string[], messageId: string): Promise<void> {
    if (pendingActionIds.length === 0) return;
    await db
      .update(everestPendingActions)
      .set({ messageId })
      .where(and(inArray(everestPendingActions.id, pendingActionIds), eq(everestPendingActions.businessId, this.businessId)));
  }

  async expireStalePendingActions(conversationId: string, now: string): Promise<void> {
    await db
      .update(everestPendingActions)
      .set({ status: "expired", resolvedAt: now })
      .where(
        and(
          eq(everestPendingActions.conversationId, conversationId),
          eq(everestPendingActions.businessId, this.businessId),
          eq(everestPendingActions.status, "pending"),
          lte(everestPendingActions.expiresAt, now)
        )
      );
  }

  async claimPendingAction(userId: string, id: string, now: string): Promise<boolean> {
    // One conditional UPDATE decides the winner: only a still-pending, unexpired action owned by this user in this business can be claimed, and only once.
    const result = db
      .update(everestPendingActions)
      .set({ status: "confirmed", resolvedAt: now })
      .where(
        and(
          eq(everestPendingActions.id, id),
          eq(everestPendingActions.businessId, this.businessId),
          eq(everestPendingActions.userId, userId),
          eq(everestPendingActions.status, "pending"),
          sql`${everestPendingActions.expiresAt} > ${now}`
        )
      )
      .run();
    return result.changes === 1;
  }

  async cancelPendingAction(userId: string, id: string, now: string): Promise<boolean> {
    const result = db
      .update(everestPendingActions)
      .set({ status: "cancelled", resolvedAt: now })
      .where(
        and(
          eq(everestPendingActions.id, id),
          eq(everestPendingActions.businessId, this.businessId),
          eq(everestPendingActions.userId, userId),
          eq(everestPendingActions.status, "pending")
        )
      )
      .run();
    return result.changes === 1;
  }

  async markExpired(id: string, now: string): Promise<void> {
    await db
      .update(everestPendingActions)
      .set({ status: "expired", resolvedAt: now })
      .where(and(eq(everestPendingActions.id, id), eq(everestPendingActions.businessId, this.businessId), eq(everestPendingActions.status, "pending")));
  }

  async recordPendingResult(id: string, ok: boolean, message: string): Promise<void> {
    await db
      .update(everestPendingActions)
      .set({ resultOk: ok, resultMessage: message })
      .where(and(eq(everestPendingActions.id, id), eq(everestPendingActions.businessId, this.businessId)));
  }

  async addAuditEntry(entry: NewAuditEntry): Promise<void> {
    await db.insert(everestAuditLog).values({
      id: generateId("aaudit"),
      businessId: this.businessId,
      userId: entry.userId,
      pendingActionId: entry.pendingActionId,
      toolName: entry.toolName,
      argsJson: JSON.stringify(entry.args),
      beforeJson: JSON.stringify(entry.before),
      outcome: entry.outcome,
      detail: entry.detail,
      createdAt: entry.createdAt,
    });
  }
}

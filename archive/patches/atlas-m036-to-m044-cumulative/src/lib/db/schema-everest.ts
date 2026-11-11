import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { businesses, users } from "./schema";

/**
 * Mission 036 — tables for Everest, the in-app assistant. Kept in their
 * own file (and listed in drizzle.config.ts) so the assistant feature
 * adds to the database without editing the shared schema.ts.
 *
 * Every table carries `business_id` and every query goes through the
 * assistant repository, which is constructed per business — the same
 * structural tenant isolation as every other feature.
 */

/** One chat thread per row, owned by one user of one business. */
export const everestConversations = sqliteTable(
  "everest_conversations",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull().default("New chat"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => [index("everest_conversations_business_user_idx").on(table.businessId, table.userId)]
);

/**
 * Text turns only ("user" or "assistant"). Tool-call traces are not
 * stored: the model's context for a later turn is rebuilt from these
 * plain texts, so a poisoned tool result can never be replayed to it.
 * A "user" row is one unit of the monthly `everest_messages` usage.
 */
export const everestMessages = sqliteTable(
  "everest_messages",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => everestConversations.id, { onDelete: "cascade" }),
    /** "user" | "assistant". */
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => [
    index("everest_messages_conversation_idx").on(table.conversationId, table.createdAt),
    index("everest_messages_business_role_created_idx").on(table.businessId, table.role, table.createdAt),
  ]
);

/**
 * A change Everest has *proposed* but not made. Nothing in an inventory
 * table changes until the signed-in user presses Confirm, which turns
 * `pending` into `confirmed` with a single conditional UPDATE
 * (scoped to business + user + not expired) before the change runs.
 */
export const everestPendingActions = sqliteTable(
  "everest_pending_actions",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => everestConversations.id, { onDelete: "cascade" }),
    /** The assistant message this proposal was made under (set after the reply is saved). */
    messageId: text("message_id"),
    toolName: text("tool_name").notNull(),
    /** Validated arguments, JSON. */
    argsJson: text("args_json").notNull(),
    /** Human-readable summary shown on the confirmation card. */
    summary: text("summary").notNull(),
    /** JSON array of {label, before, after} lines the card renders. */
    changesJson: text("changes_json").notNull().default("[]"),
    /** "pending" | "confirmed" | "cancelled" | "expired". */
    status: text("status").notNull(),
    /** Set once a confirmed action has finished running: true = succeeded (fully), false = failed or partial. */
    resultOk: integer("result_ok", { mode: "boolean" }),
    resultMessage: text("result_message"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    expiresAt: text("expires_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("everest_pending_actions_business_idx").on(table.businessId),
    index("everest_pending_actions_conversation_idx").on(table.conversationId),
  ]
);

/**
 * One row per executed (confirmed) action: who, when, what, and a
 * snapshot of the items as they were before an update or delete.
 * There is no undo in this mission; this is the record that makes one
 * possible later.
 */
export const everestAuditLog = sqliteTable(
  "everest_audit_log",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    pendingActionId: text("pending_action_id").notNull(),
    toolName: text("tool_name").notNull(),
    argsJson: text("args_json").notNull(),
    /** JSON array of the affected items before the change (empty for a create). */
    beforeJson: text("before_json").notNull().default("[]"),
    /** "succeeded" | "partial" | "failed". */
    outcome: text("outcome").notNull(),
    detail: text("detail"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => [index("everest_audit_log_business_idx").on(table.businessId, table.createdAt)]
);

export type EverestConversationRow = typeof everestConversations.$inferSelect;
export type EverestMessageRow = typeof everestMessages.$inferSelect;
export type EverestPendingActionRow = typeof everestPendingActions.$inferSelect;
export type EverestAuditLogRow = typeof everestAuditLog.$inferSelect;

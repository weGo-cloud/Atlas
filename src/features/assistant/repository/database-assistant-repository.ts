import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  assistantConversations,
  assistantMessages,
  assistantSettings,
  type AssistantConversationRow,
  type AssistantMessageRow,
  type AssistantSettingsRow,
} from "@/lib/db/schema";
import type { AssistantMetrics, AssistantRepository, ConversationListFilter, ConversationPatch } from "../domain/ports";
import {
  emptyContext,
  type AssistantConversation,
  type AssistantMessage,
  type AssistantSettings,
  type ConversationChannel,
  type ConversationContext,
  type ConversationState,
  type MessageRole,
  type TurnEvent,
} from "../domain/types";

let counter = 0;
function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${counter.toString(36)}`;
}

function parseContext(json: string): ConversationContext {
  try {
    const parsed = JSON.parse(json) as Partial<ConversationContext>;
    return {
      profile: parsed.profile ?? {},
      items: parsed.items ?? {},
      shownOrder: Array.isArray(parsed.shownOrder) ? parsed.shownOrder : [],
    };
  } catch {
    return emptyContext();
  }
}

function toConversation(row: AssistantConversationRow): AssistantConversation {
  return {
    id: row.id,
    businessId: row.businessId,
    channel: row.channel as ConversationChannel,
    customerKey: row.customerKey,
    customerName: row.customerName,
    state: row.state as ConversationState,
    context: parseContext(row.contextJson),
    leadId: row.leadId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessage(row: AssistantMessageRow): AssistantMessage {
  let toolEvents: TurnEvent[] | null = null;
  if (row.toolEventsJson) {
    try {
      toolEvents = JSON.parse(row.toolEventsJson) as TurnEvent[];
    } catch {
      toolEvents = null;
    }
  }
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageRole,
    content: row.content,
    toolEvents,
    externalId: row.externalId,
    createdAt: row.createdAt,
  };
}

export function defaultSettings(businessId: string): AssistantSettings {
  return {
    businessId,
    assistantEnabled: true,
    displayName: null,
    openingHours: null,
    location: null,
    deliveryPolicy: null,
    paymentMethods: null,
    greeting: null,
    tone: "friendly",
    handoffTopics: null,
    whatsappPhoneNumberId: null,
  };
}

function toSettings(row: AssistantSettingsRow): AssistantSettings {
  return {
    businessId: row.businessId,
    assistantEnabled: row.assistantEnabled,
    displayName: row.displayName,
    openingHours: row.openingHours,
    location: row.location,
    deliveryPolicy: row.deliveryPolicy,
    paymentMethods: row.paymentMethods,
    greeting: row.greeting,
    tone: row.tone === "formal" ? "formal" : "friendly",
    handoffTopics: row.handoffTopics,
    whatsappPhoneNumberId: row.whatsappPhoneNumberId,
  };
}

/**
 * Business-scoped: every query below carries `business_id = this.businessId`.
 * The one deliberate exception is `findBusinessIdByWhatsAppPhoneNumberId`,
 * a static lookup used by the webhook to decide *which* business an
 * inbound WhatsApp message belongs to before any business is known.
 */
export class DatabaseAssistantRepository implements AssistantRepository {
  constructor(private readonly businessId: string) {}

  static async findBusinessIdByWhatsAppPhoneNumberId(phoneNumberId: string): Promise<string | null> {
    const rows = await db
      .select({ businessId: assistantSettings.businessId })
      .from(assistantSettings)
      .where(eq(assistantSettings.whatsappPhoneNumberId, phoneNumberId))
      .limit(1);
    return rows[0]?.businessId ?? null;
  }

  async getConversation(id: string): Promise<AssistantConversation | null> {
    const rows = await db
      .select()
      .from(assistantConversations)
      .where(and(eq(assistantConversations.id, id), eq(assistantConversations.businessId, this.businessId)))
      .limit(1);
    return rows[0] ? toConversation(rows[0]) : null;
  }

  async findActiveConversation(channel: ConversationChannel, customerKey: string): Promise<AssistantConversation | null> {
    const rows = await db
      .select()
      .from(assistantConversations)
      .where(
        and(
          eq(assistantConversations.businessId, this.businessId),
          eq(assistantConversations.channel, channel),
          eq(assistantConversations.customerKey, customerKey)
        )
      )
      .orderBy(desc(assistantConversations.updatedAt))
      .limit(1);
    return rows[0] ? toConversation(rows[0]) : null;
  }

  async createConversation(input: { channel: ConversationChannel; customerKey: string; customerName?: string | null }): Promise<AssistantConversation> {
    const id = generateId("asstc");
    const now = new Date().toISOString();
    await db.insert(assistantConversations).values({
      id,
      businessId: this.businessId,
      channel: input.channel,
      customerKey: input.customerKey,
      customerName: input.customerName ?? null,
      state: "bot",
      contextJson: JSON.stringify(emptyContext()),
      createdAt: now,
      updatedAt: now,
    });
    const created = await this.getConversation(id);
    if (!created) throw new Error("Failed to read back conversation.");
    return created;
  }

  async updateConversation(id: string, patch: ConversationPatch): Promise<void> {
    await db
      .update(assistantConversations)
      .set({
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.customerName !== undefined ? { customerName: patch.customerName } : {}),
        ...(patch.context !== undefined ? { contextJson: JSON.stringify(patch.context) } : {}),
        ...(patch.leadId !== undefined ? { leadId: patch.leadId } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(assistantConversations.id, id), eq(assistantConversations.businessId, this.businessId)));
  }

  async hasExternalId(externalId: string): Promise<boolean> {
    const rows = await db
      .select({ id: assistantMessages.id })
      .from(assistantMessages)
      .where(and(eq(assistantMessages.externalId, externalId), eq(assistantMessages.businessId, this.businessId)))
      .limit(1);
    return rows.length > 0;
  }

  async appendMessage(input: {
    conversationId: string;
    role: MessageRole;
    content: string;
    toolEvents?: TurnEvent[] | null;
    externalId?: string | null;
  }): Promise<AssistantMessage | null> {
    const id = generateId("asstm");
    const now = new Date().toISOString();
    try {
      await db.insert(assistantMessages).values({
        id,
        conversationId: input.conversationId,
        businessId: this.businessId,
        role: input.role,
        content: input.content,
        toolEventsJson: input.toolEvents && input.toolEvents.length > 0 ? JSON.stringify(input.toolEvents) : null,
        externalId: input.externalId ?? null,
        createdAt: now,
      });
    } catch (error) {
      // The unique index on external_id is the idempotency guard: a duplicate delivery lands here.
      if (input.externalId && error instanceof Error && /UNIQUE/i.test(error.message)) return null;
      throw error;
    }
    return {
      id,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      toolEvents: input.toolEvents ?? null,
      externalId: input.externalId ?? null,
      createdAt: now,
    };
  }

  async listMessages(conversationId: string, limit = 50): Promise<AssistantMessage[]> {
    const rows = await db
      .select()
      .from(assistantMessages)
      .where(and(eq(assistantMessages.conversationId, conversationId), eq(assistantMessages.businessId, this.businessId)))
      .orderBy(desc(assistantMessages.createdAt), desc(assistantMessages.id))
      .limit(limit);
    return rows.reverse().map(toMessage);
  }

  async listConversations(filter: ConversationListFilter = {}): Promise<AssistantConversation[]> {
    const conditions = [eq(assistantConversations.businessId, this.businessId)];
    if (filter.channel) conditions.push(eq(assistantConversations.channel, filter.channel));
    if (filter.state) conditions.push(eq(assistantConversations.state, filter.state));
    if (filter.hasLead === true) conditions.push(sql`${assistantConversations.leadId} is not null`);
    if (filter.hasLead === false) conditions.push(sql`${assistantConversations.leadId} is null`);
    const rows = await db
      .select()
      .from(assistantConversations)
      .where(and(...conditions))
      .orderBy(desc(assistantConversations.updatedAt))
      .limit(Math.min(filter.limit ?? 50, 200));
    return rows.map(toConversation);
  }

  async deleteConversation(id: string): Promise<boolean> {
    const existing = await this.getConversation(id);
    if (!existing) return false;
    await db.delete(assistantMessages).where(and(eq(assistantMessages.conversationId, id), eq(assistantMessages.businessId, this.businessId)));
    await db.delete(assistantConversations).where(and(eq(assistantConversations.id, id), eq(assistantConversations.businessId, this.businessId)));
    return true;
  }

  async metrics(): Promise<AssistantMetrics> {
    const [conversationCounts] = await db
      .select({
        conversations: sql<number>`count(*)`,
        enquiries: sql<number>`sum(case when ${assistantConversations.leadId} is not null then 1 else 0 end)`,
        humanTakeovers: sql<number>`sum(case when ${assistantConversations.state} = 'human' then 1 else 0 end)`,
      })
      .from(assistantConversations)
      .where(eq(assistantConversations.businessId, this.businessId));
    const [failureCount] = await db
      .select({ failures: sql<number>`count(*)` })
      .from(assistantMessages)
      .where(and(eq(assistantMessages.businessId, this.businessId), sql`${assistantMessages.toolEventsJson} like '%grounding_failure%'`));
    return {
      conversations: Number(conversationCounts?.conversations ?? 0),
      enquiries: Number(conversationCounts?.enquiries ?? 0),
      humanTakeovers: Number(conversationCounts?.humanTakeovers ?? 0),
      groundingFailures: Number(failureCount?.failures ?? 0),
    };
  }

  async getSettings(): Promise<AssistantSettings> {
    const rows = await db.select().from(assistantSettings).where(eq(assistantSettings.businessId, this.businessId)).limit(1);
    return rows[0] ? toSettings(rows[0]) : defaultSettings(this.businessId);
  }

  async saveSettings(patch: Partial<Omit<AssistantSettings, "businessId">>): Promise<AssistantSettings> {
    const current = await this.getSettings();
    const next = { ...current, ...patch };
    const now = new Date().toISOString();
    const values = {
      businessId: this.businessId,
      assistantEnabled: next.assistantEnabled,
      displayName: next.displayName,
      openingHours: next.openingHours,
      location: next.location,
      deliveryPolicy: next.deliveryPolicy,
      paymentMethods: next.paymentMethods,
      greeting: next.greeting,
      tone: next.tone,
      handoffTopics: next.handoffTopics,
      whatsappPhoneNumberId: next.whatsappPhoneNumberId,
      updatedAt: now,
    };
    await db.insert(assistantSettings).values(values).onConflictDoUpdate({ target: assistantSettings.businessId, set: values });
    return this.getSettings();
  }
}

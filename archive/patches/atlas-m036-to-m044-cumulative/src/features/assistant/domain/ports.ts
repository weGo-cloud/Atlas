import type {
  AssistantConversation,
  AssistantMessage,
  AssistantSettings,
  ConversationChannel,
  ConversationContext,
  ConversationState,
  MessageRole,
  TurnEvent,
} from "./types";

export type ConversationPatch = {
  state?: ConversationState;
  customerName?: string | null;
  context?: ConversationContext;
  leadId?: string | null;
};

export type ConversationListFilter = {
  channel?: ConversationChannel;
  state?: ConversationState;
  hasLead?: boolean;
  limit?: number;
};

export type AssistantMetrics = {
  conversations: number;
  enquiries: number;
  groundingFailures: number;
  humanTakeovers: number;
};

/** Business-scoped persistence. Every method is implicitly restricted to one business. */
export interface AssistantRepository {
  getConversation(id: string): Promise<AssistantConversation | null>;
  findActiveConversation(channel: ConversationChannel, customerKey: string): Promise<AssistantConversation | null>;
  createConversation(input: { channel: ConversationChannel; customerKey: string; customerName?: string | null }): Promise<AssistantConversation>;
  updateConversation(id: string, patch: ConversationPatch): Promise<void>;
  /** Returns null (and stores nothing) when `externalId` was already recorded — the idempotency guard for retried webhooks. */
  appendMessage(input: {
    conversationId: string;
    role: MessageRole;
    content: string;
    toolEvents?: TurnEvent[] | null;
    externalId?: string | null;
  }): Promise<AssistantMessage | null>;
  hasExternalId(externalId: string): Promise<boolean>;
  listMessages(conversationId: string, limit?: number): Promise<AssistantMessage[]>;
  listConversations(filter?: ConversationListFilter): Promise<AssistantConversation[]>;
  deleteConversation(id: string): Promise<boolean>;
  metrics(): Promise<AssistantMetrics>;
  getSettings(): Promise<AssistantSettings>;
  saveSettings(patch: Partial<Omit<AssistantSettings, "businessId">>): Promise<AssistantSettings>;
}

export type LeadHandoffInput = {
  conversation: AssistantConversation;
  name: string;
  phone: string;
  itemIds: string[];
  /** Deterministic summary of requirements, items discussed and recent customer messages. */
  summary: string;
};

/**
 * Creates (or, for a conversation that already produced a lead, updates)
 * a real Atlas lead. Implemented on top of the existing
 * CustomerService/LeadService — never a parallel lead store.
 */
export interface LeadHandoff {
  createOrUpdate(input: LeadHandoffInput): Promise<{ leadId: string; created: boolean } | { error: string }>;
}

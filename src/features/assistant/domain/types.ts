/**
 * Mission 033 — Atlas Assistant domain types. Channel-agnostic: nothing
 * here knows about HTTP, WhatsApp payloads, or any one vertical.
 */
export const CONVERSATION_CHANNELS = ["website_chat", "whatsapp", "simulated"] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

export const CONVERSATION_CHANNEL_LABEL: Record<ConversationChannel, string> = {
  website_chat: "Website chat",
  whatsapp: "WhatsApp",
  simulated: "Demo simulation",
};

export type ConversationState = "bot" | "human" | "closed";

export const CONVERSATION_STATE_LABEL: Record<ConversationState, string> = {
  bot: "Assistant",
  human: "Team",
  closed: "Closed",
};

/** What the customer has told us they want. Every field optional — filled in as the conversation reveals it. */
export type RequirementProfile = {
  category?: string;
  budgetMin?: number;
  budgetMax?: number;
  colors?: string[];
  materials?: string[];
  condition?: string;
  useCase?: string;
  sizeConstraints?: string;
  seats?: number;
  location?: string;
  deadline?: string;
  notes?: string;
};

/** One inventory item as the assistant is allowed to know it — always read from the database, never from the model. */
export type ItemFacts = {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  price: number;
  currency: string;
  priceLabel: string;
  condition: string;
  status: "available" | "reserved" | "sold";
  material: string | null;
  color: string | null;
  dimensions: string | null;
  description: string;
  imageUrl: string | null;
};

/** Persisted per conversation (assistant_conversations.context_json). */
export type ConversationContext = {
  profile: RequirementProfile;
  /** Snapshot of every item shown or looked up in this conversation, keyed by id — the guard's source of truth for "what did we tell them?". */
  items: Record<string, ItemFacts>;
  /** Ids in the order they were first shown, most recent last — lets "the second one" be resolved. */
  shownOrder: string[];
};

export function emptyContext(): ConversationContext {
  return { profile: {}, items: {}, shownOrder: [] };
}

export type AssistantConversation = {
  id: string;
  businessId: string;
  channel: ConversationChannel;
  customerKey: string;
  customerName: string | null;
  state: ConversationState;
  context: ConversationContext;
  leadId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageRole = "customer" | "assistant" | "staff";

export type AssistantMessage = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolEvents: TurnEvent[] | null;
  externalId: string | null;
  createdAt: string;
};

export type AssistantTone = "friendly" | "formal";

export type AssistantSettings = {
  businessId: string;
  assistantEnabled: boolean;
  displayName: string | null;
  openingHours: string | null;
  location: string | null;
  deliveryPolicy: string | null;
  paymentMethods: string | null;
  greeting: string | null;
  tone: AssistantTone;
  handoffTopics: string | null;
  whatsappPhoneNumberId: string | null;
};

export type ProductCard = {
  id: string;
  name: string;
  priceLabel: string;
  status: ItemFacts["status"];
  imageUrl: string | null;
  dimensions: string | null;
  material: string | null;
  color: string | null;
};

export type TurnEvent =
  | { type: "tool_call"; name: string; ok: boolean }
  | { type: "grounding_failure"; violations: string[] }
  | { type: "llm_error"; code: string }
  | { type: "lead_created"; leadId: string }
  | { type: "lead_updated"; leadId: string }
  | { type: "handoff_to_human" }
  | { type: "silent_human_mode" };

export type TurnResult = {
  conversationId: string;
  state: ConversationState;
  /** null when the assistant intentionally stays silent (human takeover) or the message was a duplicate. */
  reply: string | null;
  products: ProductCard[];
  leadId: string | null;
  duplicate: boolean;
  events: TurnEvent[];
};

export const MAX_CUSTOMER_MESSAGE_CHARS = 1000;

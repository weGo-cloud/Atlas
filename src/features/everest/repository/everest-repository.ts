import type { AuditOutcome, ChangeLine, ChatMessage, Conversation, PendingAction, WriteToolName } from "../domain/types";

export type NewPendingAction = {
  conversationId: string;
  userId: string;
  toolName: WriteToolName;
  args: Record<string, unknown>;
  summary: string;
  changes: ChangeLine[];
  createdAt: string;
  expiresAt: string;
};

export type NewAuditEntry = {
  userId: string;
  pendingActionId: string;
  toolName: WriteToolName;
  args: Record<string, unknown>;
  before: unknown[];
  outcome: AuditOutcome;
  detail: string | null;
  createdAt: string;
};

export type RecordMessageResult =
  | { recorded: true; message: ChatMessage }
  | { recorded: false; reason: "LIMIT_REACHED" | "RATE_LIMITED"; used: number };

/**
 * Persistence for the assistant. Constructed per business: every method
 * is scoped to `businessId` structurally (the same dependency-injection
 * pattern as every other repository), never by a caller-supplied id.
 */
export interface EverestRepository {
  createConversation(userId: string, title: string, now: string): Promise<Conversation>;
  getConversation(userId: string, conversationId: string): Promise<Conversation | null>;
  getLatestConversation(userId: string): Promise<Conversation | null>;
  touchConversation(conversationId: string, now: string, title?: string): Promise<void>;

  /**
   * Records a user message *only if* the business is under its monthly
   * allowance and the user is under the per-minute rate limit — the
   * count and the insert happen in one transaction so two concurrent
   * sends cannot both squeeze under the cap. `monthlyLimit` null means
   * unlimited.
   */
  recordUserMessageWithinLimits(input: {
    userId: string;
    conversationId: string;
    content: string;
    now: string;
    monthStart: string;
    monthlyLimit: number | null;
    rateWindowStart: string;
    rateLimit: number;
  }): Promise<RecordMessageResult>;
  addEverestMessage(userId: string, conversationId: string, content: string, now: string): Promise<ChatMessage>;
  listMessages(conversationId: string, limit: number): Promise<ChatMessage[]>;
  countUserMessagesSince(monthStart: string): Promise<number>;

  createPendingAction(input: NewPendingAction): Promise<PendingAction>;
  getPendingAction(userId: string, id: string): Promise<PendingAction | null>;
  listPendingActions(conversationId: string): Promise<PendingAction[]>;
  attachPendingActionsToMessage(pendingActionIds: string[], messageId: string): Promise<void>;
  /** Marks every still-`pending` action in a conversation whose expiry has passed as `expired`. */
  expireStalePendingActions(conversationId: string, now: string): Promise<void>;
  /** pending -> confirmed iff still pending, owned by this user, and not expired. Returns whether this call won. */
  claimPendingAction(userId: string, id: string, now: string): Promise<boolean>;
  /** pending -> cancelled iff still pending and owned by this user. */
  cancelPendingAction(userId: string, id: string, now: string): Promise<boolean>;
  /** Marks a pending action expired iff it is still pending (used when a confirm arrives too late). */
  markExpired(id: string, now: string): Promise<void>;
  recordPendingResult(id: string, ok: boolean, message: string): Promise<void>;

  addAuditEntry(entry: NewAuditEntry): Promise<void>;
}

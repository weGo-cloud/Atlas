import type { UserRole } from "@/features/auth/domain/user";

export type EverestRole = "user" | "assistant";

export type Conversation = {
  id: string;
  businessId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: EverestRole;
  content: string;
  createdAt: string;
};

export type PendingActionStatus = "pending" | "confirmed" | "cancelled" | "expired";

/** One line on a confirmation card, e.g. { label: "Price", before: "KES 40,000", after: "KES 36,000" }. */
export type ChangeLine = { label: string; before: string | null; after: string | null };

export const READ_TOOL_NAMES = ["search_inventory", "get_item", "count_by_status", "list_categories"] as const;
export const WRITE_TOOL_NAMES = ["create_item", "update_item_fields", "set_item_status", "delete_items", "bulk_update"] as const;
export type ReadToolName = (typeof READ_TOOL_NAMES)[number];
export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];
export type ToolName = ReadToolName | WriteToolName;

export function isWriteToolName(name: string): name is WriteToolName {
  return (WRITE_TOOL_NAMES as readonly string[]).includes(name);
}

export function isReadToolName(name: string): name is ReadToolName {
  return (READ_TOOL_NAMES as readonly string[]).includes(name);
}

export type PendingAction = {
  id: string;
  businessId: string;
  userId: string;
  conversationId: string;
  messageId: string | null;
  toolName: WriteToolName;
  args: Record<string, unknown>;
  summary: string;
  changes: ChangeLine[];
  status: PendingActionStatus;
  resultOk: boolean | null;
  resultMessage: string | null;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
};

/** The signed-in person on whose behalf Everest acts. Permissions are re-checked against this at confirm time. */
export type Actor = { userId: string; role: UserRole };

export type AuditOutcome = "succeeded" | "partial" | "failed";

export type EverestErrorCode =
  | "NOT_CONFIGURED"
  | "FORBIDDEN"
  | "LIMIT_REACHED"
  | "RATE_LIMITED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "ACTION_NOT_PENDING"
  | "ACTION_EXPIRED"
  | "LLM_UNAVAILABLE"
  | "INTERNAL";

export type EverestError = { code: EverestErrorCode; message: string };

export type EverestResult<T> = { ok: true; data: T } | { ok: false; error: EverestError };

export function ok<T>(data: T): EverestResult<T> {
  return { ok: true, data };
}

export function fail(code: EverestErrorCode, message: string): EverestResult<never> {
  return { ok: false, error: { code, message } };
}

import { MAX_CUSTOMER_MESSAGE_CHARS } from "../domain/types";

export type ChatRequest = { businessId: string; conversationId: string | null; message: string };

export type ChatRequestValidation = { ok: true; value: ChatRequest } | { ok: false; error: string };

const MAX_BODY_CHARS = 4_000;

/**
 * Validates the public web-chat payload. Deliberately strict: string
 * fields only, length-capped, no extra fields honoured — in particular
 * nothing in the body can choose *which* business's data a tool reads
 * beyond the one `businessId` the storefront itself embeds (and that is
 * re-checked against entitlements and the storefront being enabled).
 */
export function validateChatRequest(body: unknown, rawLength: number): ChatRequestValidation {
  if (rawLength > MAX_BODY_CHARS) return { ok: false, error: "Request too large." };
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request." };
  const { businessId, conversationId, message } = body as Record<string, unknown>;
  if (typeof businessId !== "string" || !businessId.trim() || businessId.length > 80) return { ok: false, error: "Invalid business." };
  if (typeof message !== "string" || !message.trim()) return { ok: false, error: "Please type a message." };
  if (message.length > MAX_CUSTOMER_MESSAGE_CHARS) {
    return { ok: false, error: `Messages are limited to ${MAX_CUSTOMER_MESSAGE_CHARS} characters.` };
  }
  if (conversationId !== undefined && conversationId !== null && (typeof conversationId !== "string" || conversationId.length > 80)) {
    return { ok: false, error: "Invalid conversation." };
  }
  return {
    ok: true,
    value: { businessId: businessId.trim(), conversationId: typeof conversationId === "string" && conversationId ? conversationId : null, message: message.trim() },
  };
}

export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

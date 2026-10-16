import { MAX_UNTRUSTED_FIELD_CHARS } from "./thresholds";

/**
 * Mission 036 — everything that came out of the database (item names,
 * descriptions, notes) is *data*, never instructions, even though the
 * business wrote it and a customer might have influenced it. Before any
 * of it reaches the model it is truncated and serialized as JSON with
 * every angle bracket escaped, so it cannot contain a tag, a fake
 * delimiter or a fake "system" block. The system prompt separately tells
 * the model that tool results are data only.
 */
export function truncateUntrusted(value: string, max = MAX_UNTRUSTED_FIELD_CHARS): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}

/** Serializes a tool result for the model: JSON with `<` and `>` escaped. */
export function serializeToolData(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

/** Plain-text variant used when an untrusted string is interpolated into a card or message. */
export function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

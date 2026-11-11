/**
 * Mission 036 — every configurable limit for the assistant, in one
 * documented place (engineering principle: thresholds are centralized
 * and findable). Nothing here is read from the environment so tests are
 * deterministic; change a number here and it changes everywhere.
 */

/** A proposed change expires if the user hasn't confirmed it within this window. */
export const PENDING_ACTION_TTL_MINUTES = 10;

/** Most items one bulk update or delete may touch. Over this is refused, not truncated. */
export const BULK_ACTION_CAP = 25;

/** Most items a single search tool call returns to the model. */
export const SEARCH_RESULT_LIMIT = 15;

/** Most characters of one user message accepted. */
export const MAX_INPUT_CHARS = 2000;

/** How many previous text turns (user + assistant) are sent back as context. */
export const CONTEXT_MESSAGE_LIMIT = 16;

/** Most characters of any single earlier turn sent back as context. */
export const MAX_CONTEXT_CHARS_PER_MESSAGE = 1500;

/** Most characters of one inventory text field (like a description) passed to the model. */
export const MAX_UNTRUSTED_FIELD_CHARS = 300;

/** Most tokens the model may produce in one reply. */
export const MAX_REPLY_TOKENS = 1024;

/** Most model round-trips (tool calls) allowed while answering one message. */
export const MAX_TOOL_ITERATIONS = 6;

/** A user may send at most this many messages in any rolling minute. */
export const RATE_LIMIT_MESSAGES_PER_MINUTE = 8;

/** Seconds to wait for the model before giving up. */
export const LLM_TIMEOUT_SECONDS = 45;

/** Largest percentage change a bulk price adjustment may apply, either direction. */
export const MAX_PRICE_PERCENT_CHANGE = 90;

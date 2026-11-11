import type { ItemFacts } from "../domain/types";

/**
 * Mission 033, Section 6 — the correctness guarantee. Prompting alone
 * can't promise the assistant never states an invented price or claims a
 * sold piece is available, so every model reply passes through here
 * *before* it is sent. It checks, deterministically:
 *
 *  1. every money amount in the reply is a price the customer was
 *     actually shown (or a sum of up to three of them), a number the
 *     customer themself said, or a number from the business's own facts;
 *  2. every dimension string (e.g. "180cm x 90cm") appears in a shown
 *     item's real dimensions, or was said by the customer;
 *  3. no reserved/sold piece is described as available / in stock;
 *  4. no affirmative promise of discount / delivery terms / warranty /
 *     financing unless the business facts cover it.
 *
 * It errs on the side of blocking: a false positive costs one
 * regeneration (then a safe fallback); a false negative costs a
 * customer being told something untrue.
 */
export type GroundingContext = {
  items: ItemFacts[];
  customerText: string;
  businessFactsText: string;
};

export type GroundingResult = { ok: true } | { ok: false; violations: string[] };

function parseAmount(raw: string, suffix?: string): number {
  const value = Number.parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return Number.NaN;
  const s = (suffix ?? "").trim().toLowerCase();
  if (s === "k") return value * 1_000;
  if (s === "m") return value * 1_000_000;
  return value;
}

/** Money amounts written with a currency marker: "KSh 68,000", "68,000 KES", "KES 1.2M", "68k KSh". */
export function extractMoneyAmounts(text: string): number[] {
  const amounts: number[] = [];
  const before = /\b(?:ksh|kshs|kes|sh)(?![a-z])\.?\s*([\d][\d,]*(?:\.\d+)?)(\s?[km]\b)?/gi;
  const after = /([\d][\d,]*(?:\.\d+)?)(\s?[km])?\s*(?:(?:ksh|kshs|kes)(?![a-z])|\/=)/gi;
  for (const regex of [before, after]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const amount = parseAmount(match[1], match[2]);
      if (Number.isFinite(amount)) amounts.push(amount);
    }
  }
  return amounts;
}

/** Every number the customer/business wrote, in any form — these are allowed to be echoed back ("under 80k", "80,000"). */
function extractAnyNumbers(text: string): number[] {
  const numbers: number[] = [];
  const regex = /(\d[\d,]*(?:\.\d+)?)(\s?[km]\b)?/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const amount = parseAmount(match[1], match[2]);
    if (Number.isFinite(amount)) numbers.push(amount);
  }
  return numbers;
}

function subsetSums(prices: number[], maxSize: number): Set<number> {
  const sums = new Set<number>();
  const capped = prices.slice(0, 12);
  const walk = (start: number, size: number, total: number) => {
    if (size > 0) sums.add(total);
    if (size === maxSize) return;
    for (let i = start; i < capped.length; i += 1) walk(i + 1, size + 1, total + capped[i]);
  };
  walk(0, 0, 0);
  return sums;
}

function dimensionKey(text: string): string {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).join("x");
}

function extractDimensionStrings(text: string): string[] {
  const regex = /\b\d{1,3}(?:\.\d+)?\s?(?:cm|mm|m|in|inch|inches)?\s?[x×]\s?\d{1,3}(?:\.\d+)?(?:\s?(?:cm|mm|m|in|inch|inches)?\s?[x×]\s?\d{1,3}(?:\.\d+)?)?\s?(?:cm|mm|m|in|inch|inches)?/gi;
  return text.match(regex) ?? [];
}

const PROMISE_PATTERNS: Array<{ topic: string; pattern: RegExp; coveredBy: RegExp }> = [
  {
    topic: "a discount",
    pattern: /\b\d{1,2}\s?%\s?(?:off|discount)|\bdiscount(?:ed)?\s+(?:of|available|price)|\bspecial offer\b|\bon offer\b/i,
    coveredBy: /discount|offer|% off/i,
  },
  {
    topic: "delivery terms",
    pattern: /\bfree delivery\b|\bdelivery (?:is|will be) (?:free|within|in)\b|\bdeliver(?:ed)? (?:within|in) \d|\bdelivery (?:fee|cost|charge)s? (?:is|are|of)\b/i,
    coveredBy: /deliver|shipping|transport/i,
  },
  {
    topic: "a warranty",
    pattern: /\b\d+[- ]?(?:year|month)s?\s+(?:warranty|guarantee)|\b(?:comes?|come) with a (?:warranty|guarantee)|\bwe (?:offer|provide|give) (?:a |you a )?(?:warranty|guarantee)/i,
    coveredBy: /warrant|guarantee/i,
  },
  {
    topic: "financing / instalments",
    pattern: /\bhire purchase\b|\bfinancing (?:is )?available\b|\b(?:pay|paid) (?:in|over) \d+\s?(?:months|instal)|\binstal?lments? (?:are|is) available|\blipa mdogo mdogo (?:is|inapatikana)/i,
    coveredBy: /instal|financ|hire purchase|lipa mdogo|payment plan/i,
  },
];

export function checkGrounding(reply: string, context: GroundingContext): GroundingResult {
  const violations: string[] = [];

  // 1. Money.
  const allowedMoney = new Set<number>();
  for (const item of context.items) allowedMoney.add(item.price);
  for (const sum of subsetSums(context.items.map((item) => item.price), 3)) allowedMoney.add(sum);
  for (const value of extractAnyNumbers(context.customerText)) allowedMoney.add(value);
  for (const value of extractAnyNumbers(context.businessFactsText)) allowedMoney.add(value);
  for (const amount of extractMoneyAmounts(reply)) {
    if (!allowedMoney.has(amount)) {
      violations.push(`The amount ${amount.toLocaleString("en-US")} is not a price from the inventory results or something the customer said.`);
    }
  }

  // 2. Dimensions.
  const allowedDimensions = [
    ...context.items.map((item) => dimensionKey(item.dimensions ?? "")),
    ...extractDimensionStrings(context.customerText).map(dimensionKey),
    ...extractDimensionStrings(context.businessFactsText).map(dimensionKey),
  ].filter(Boolean);
  for (const dimension of extractDimensionStrings(reply)) {
    const key = dimensionKey(dimension);
    if (key && !allowedDimensions.some((allowed) => allowed.includes(key))) {
      violations.push(`The dimensions "${dimension.trim()}" do not match any item that was looked up.`);
    }
  }

  // 3. Availability claims about reserved/sold pieces.
  const sentences = reply.split(/(?<=[.!?\n])\s+/);
  for (const item of context.items) {
    if (item.status === "available") continue;
    const name = item.name.toLowerCase();
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (!lower.includes(name)) continue;
      const claimsAvailable = /\b(?:available|in stock|ready to (?:buy|order))\b/.test(lower);
      const negated = /\b(?:not|isn'?t|is no longer|no longer|unavailable|out of stock|reserved|sold)\b/.test(lower);
      if (claimsAvailable && !negated) {
        violations.push(`"${item.name}" is ${item.status}, but the reply describes it as available.`);
      }
    }
  }

  // 4. Promises the business never made.
  for (const { topic, pattern, coveredBy } of PROMISE_PATTERNS) {
    if (pattern.test(reply) && !coveredBy.test(context.businessFactsText)) {
      violations.push(`The reply promises ${topic}, which is not in the business's stated information.`);
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/** Sent when the model still can't produce a grounded answer after one correction. */
export const SAFE_FALLBACK_REPLY =
  "Let me confirm the exact details with the team so I don't give you the wrong information. Could I take your name and phone number so they can follow up?";

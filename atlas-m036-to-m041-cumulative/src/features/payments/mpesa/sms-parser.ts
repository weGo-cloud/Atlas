export type ParsedMpesaSms = {
  receipt: string;
  amount: number;
  /** False when the SMS amount has cents; the ledger is whole shillings so the UI must not auto-fill it. */
  amountIsWhole: boolean;
  /** Normalized 254… number, or null when Safaricom masked it. */
  phone: string | null;
  name: string | null;
  /** ISO timestamp (SMS times are East Africa Time), or null when absent. */
  paidAt: string | null;
};

export type SmsParseResult = { ok: true; value: ParsedMpesaSms } | { ok: false; reason: string };

/**
 * Pulls the receipt code, amount, payer and time out of a pasted M-Pesa "received" confirmation SMS, so a shop can
 * record a till/paybill payment without retyping it. It NEVER saves anything: the result only pre-fills the form for
 * the user to confirm. Messages about money SENT or PAID by the shop (not received) are rejected so an outgoing
 * payment can't be recorded as income.
 */
export function parseMpesaSms(raw: string): SmsParseResult {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "Paste the M-Pesa confirmation message first." };

  const receiptMatch = /\b([A-Z0-9]{10})\s+Confirmed\b/i.exec(text);
  if (!receiptMatch) return { ok: false, reason: "Couldn't find an M-Pesa receipt code. Paste the full 'Confirmed.' message." };

  if (!/\breceived\b/i.test(text)) {
    return { ok: false, reason: "That message isn't a payment you received (it looks sent/paid out). Only incoming payments can be recorded." };
  }

  const amountMatch = /(?:ksh|kes)\.?\s?([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  if (!amountMatch) return { ok: false, reason: "Couldn't find the amount in that message." };
  const amount = Number.parseFloat(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "Couldn't read the amount in that message." };

  const phoneMatch = /(?:\+?254|\b0)[17]\d{8}\b/.exec(text);
  let phone: string | null = null;
  if (phoneMatch) {
    const d = phoneMatch[0].replace(/^\+/, "");
    phone = d.startsWith("254") ? d : `254${d.slice(1)}`;
  }

  // "received from JOHN DOE 0712…" or "received from 254712… JOHN DOE": take the uppercase words next to the phone.
  let name: string | null = null;
  const afterFrom = /received from\s+(.*)$/i.exec(text)?.[1];
  if (afterFrom) {
    const cleaned = afterFrom
      .replace(/(?:\+?254|\b0)[17]\d{8}\b/g, " ")
      .split(/\bon \d|\.\s|\bAccount\b|\bNew\b/)[0]
      .replace(/\s+/g, " ")
      .trim();
    if (/^[A-Z][A-Z .'-]{2,60}$/.test(cleaned)) name = cleaned;
  }

  let paidAt: string | null = null;
  const dateMatch = /\bon (\d{1,2})\/(\d{1,2})\/(\d{2,4}) at (\d{1,2}):(\d{2})\s?(AM|PM)\b/i.exec(text);
  if (dateMatch) {
    const [, d, m, y, hh, mm, ap] = dateMatch;
    const year = y.length === 2 ? 2000 + Number.parseInt(y, 10) : Number.parseInt(y, 10);
    let hour = Number.parseInt(hh, 10) % 12;
    if (ap.toUpperCase() === "PM") hour += 12;
    const iso = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${mm}:00+03:00`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) paidAt = parsed.toISOString();
  }

  return {
    ok: true,
    value: { receipt: receiptMatch[1].toUpperCase(), amount, amountIsWhole: Number.isInteger(amount), phone, name, paidAt },
  };
}

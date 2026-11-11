export type StkCallback = {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  amount: number | null;
  receipt: string | null;
  phone: string | null;
  /** ISO timestamp from Daraja's yyyyMMddHHmmss (East Africa Time). */
  transactionAt: string | null;
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Strict parser for Daraja's STK callback body. Anything malformed returns null (and is rejected, never half-applied). */
export function parseStkCallback(body: unknown): StkCallback | null {
  const cb = obj(obj(obj(body)?.Body)?.stkCallback);
  if (!cb) return null;
  const merchantRequestId = cb.MerchantRequestID;
  const checkoutRequestId = cb.CheckoutRequestID;
  const resultCode = typeof cb.ResultCode === "number" ? cb.ResultCode : Number.parseInt(String(cb.ResultCode ?? ""), 10);
  if (typeof merchantRequestId !== "string" || typeof checkoutRequestId !== "string" || !Number.isFinite(resultCode)) return null;
  if (checkoutRequestId.length > 100 || merchantRequestId.length > 100) return null;

  const items = Array.isArray(obj(cb.CallbackMetadata)?.Item) ? (obj(cb.CallbackMetadata)!.Item as unknown[]) : [];
  const meta = new Map<string, unknown>();
  for (const item of items) {
    const o = obj(item);
    if (o && typeof o.Name === "string") meta.set(o.Name, o.Value);
  }
  const amountRaw = meta.get("Amount");
  const amount = typeof amountRaw === "number" ? amountRaw : typeof amountRaw === "string" ? Number.parseFloat(amountRaw) : null;
  const receiptRaw = meta.get("MpesaReceiptNumber");
  const receipt = typeof receiptRaw === "string" && /^[A-Z0-9]{10}$/.test(receiptRaw.toUpperCase()) ? receiptRaw.toUpperCase() : null;
  const phoneRaw = meta.get("PhoneNumber");
  const phone = phoneRaw !== undefined && /^\d{9,15}$/.test(String(phoneRaw)) ? String(phoneRaw) : null;
  const dateRaw = String(meta.get("TransactionDate") ?? "");
  let transactionAt: string | null = null;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(dateRaw);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+03:00`);
    if (!Number.isNaN(d.getTime())) transactionAt = d.toISOString();
  }
  return {
    merchantRequestId,
    checkoutRequestId,
    resultCode,
    resultDesc: typeof cb.ResultDesc === "string" ? cb.ResultDesc.slice(0, 200) : "",
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    receipt,
    phone,
    transactionAt,
  };
}

/** Maps a non-zero STK ResultCode to a terminal status and a plain-language reason for the owner. */
export function describeStkFailure(resultCode: number, resultDesc: string): { status: "failed" | "cancelled"; reason: string } {
  switch (resultCode) {
    case 1032:
      return { status: "cancelled", reason: "The customer cancelled the M-Pesa prompt." };
    case 1037:
      return { status: "failed", reason: "The prompt timed out: no response from the customer's phone." };
    case 2001:
      return { status: "failed", reason: "The customer entered the wrong M-Pesa PIN." };
    case 1:
      return { status: "failed", reason: "The customer's M-Pesa balance was insufficient." };
    case 1001:
      return { status: "failed", reason: "The customer has another M-Pesa transaction in progress. Try again shortly." };
    default:
      return { status: "failed", reason: resultDesc ? `M-Pesa reported: ${resultDesc}` : `M-Pesa reported a failure (code ${resultCode}).` };
  }
}

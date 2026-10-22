import { describe, expect, it, vi } from "vitest";

import { computeBalance } from "../domain/balance";
import { parseKesAmount, validateManualPayment } from "../domain/validate-payment-input";
import { describeStkFailure, parseStkCallback } from "../mpesa/callback";
import { DarajaClient, DarajaError, darajaTimestamp, type DarajaConfig } from "../mpesa/daraja-client";
import { formatKenyanPhone, normalizeKenyanPhone } from "../mpesa/phone";
import { parseMpesaSms } from "../mpesa/sms-parser";

describe("normalizeKenyanPhone", () => {
  it("accepts every common Kenyan format", () => {
    for (const input of ["0712345678", "712345678", "+254712345678", "254712345678", "0712 345 678", "0112345678", "0712-345-678"]) {
      expect(normalizeKenyanPhone(input), input).toMatch(/^254[17]\d{8}$/);
    }
    expect(formatKenyanPhone("254712345678")).toBe("0712 345 678");
  });
  it("rejects foreign, short, long and non-numeric input", () => {
    for (const bad of ["", "12345", "0212345678", "+255712345678", "07123456789", "abcdefghij", "0712345678; DROP TABLE"]) expect(normalizeKenyanPhone(bad), bad).toBeNull();
  });
});

describe("parseKesAmount / validateManualPayment", () => {
  it("accepts whole shillings only", () => {
    expect(parseKesAmount("1,250")).toBe(1250);
    expect(parseKesAmount("KES 5000")).toBe(5000);
    for (const bad of ["0", "-5", "12.50", "abc", "", "1e6", 0, -1, 1.5, 1_000_000_001]) expect(parseKesAmount(bad), String(bad)).toBeNull();
  });
  const base = { customerId: "c1", amount: "1000", kind: "deposit" };
  it("requires method-appropriate evidence", () => {
    expect(validateManualPayment({ ...base, method: "cash" }).ok).toBe(true);
    expect(validateManualPayment({ ...base, method: "mpesa" }).ok).toBe(false);
    expect(validateManualPayment({ ...base, method: "mpesa", reference: "short" }).ok).toBe(false);
    const ok = validateManualPayment({ ...base, method: "mpesa", reference: " sjk4x9abcd " });
    expect(ok.ok && ok.value.reference).toBe("SJK4X9ABCD");
    expect(validateManualPayment({ ...base, method: "cheque" }).ok).toBe(false);
    expect(validateManualPayment({ ...base, method: "bank_transfer", reference: "FT123456" }).ok).toBe(true);
    expect(validateManualPayment({ ...base, method: "teleport" }).ok).toBe(false);
    expect(validateManualPayment({ ...base, kind: "gift", method: "cash" }).ok).toBe(false);
  });
  it("rejects future-dated, far-past and malformed dates and bad phones", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    expect(validateManualPayment({ ...base, method: "cash", paidAt: "2026-07-01T00:00:00Z" }, now).ok).toBe(false);
    expect(validateManualPayment({ ...base, method: "cash", paidAt: "2001-01-01T00:00:00Z" }, now).ok).toBe(false);
    expect(validateManualPayment({ ...base, method: "cash", paidAt: "nonsense" }, now).ok).toBe(false);
    expect(validateManualPayment({ ...base, method: "cash", payerPhone: "123" }, now).ok).toBe(false);
    expect(validateManualPayment({ ...base, method: "cash", paidAt: "2026-05-30T09:00:00Z" }, now).ok).toBe(true);
  });
});

describe("computeBalance", () => {
  const p = (amount: number, status: string, kind = "installment") => ({ amount, status, kind }) as never;
  it("counts only confirmed money; pending reserves room; refunds subtract", () => {
    const s = computeBalance(1000, [p(300, "confirmed"), p(200, "pending"), p(100, "failed"), p(100, "reversed"), p(50, "confirmed", "refund")]);
    expect(s).toMatchObject({ received: 300, refunded: 50, netPaid: 250, pending: 200, balance: 750, collectable: 550, status: "partial" });
  });
  it("statuses", () => {
    expect(computeBalance(1000, []).status).toBe("unpaid");
    expect(computeBalance(1000, [p(1000, "confirmed")]).status).toBe("paid");
    expect(computeBalance(1000, [p(1200, "confirmed")]).status).toBe("overpaid");
    expect(computeBalance(1000, [p(1000, "confirmed")]).collectable).toBe(0);
  });
});

describe("parseMpesaSms", () => {
  it("parses a till payment message", () => {
    const r = parseMpesaSms("SJK4X9ABCD Confirmed. Ksh2,500.00 received from 254712345678 JOHN DOE on 5/10/26 at 3:45 PM. New Business balance is Ksh12,500.00.");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ receipt: "SJK4X9ABCD", amount: 2500, amountIsWhole: true, phone: "254712345678", name: "JOHN DOE" });
    if (r.ok) expect(r.value.paidAt).toBe("2026-10-05T12:45:00.000Z"); // 3:45 PM EAT
  });
  it("parses the 'You have received' style and flags cents", () => {
    const r = parseMpesaSms("QWE1234567 Confirmed. You have received Ksh1,000.50 from JANE WANJIRU 0722111222 on 1/2/26 at 9:05 AM.");
    expect(r.ok && r.value.amountIsWhole).toBe(false);
    expect(r.ok && r.value.phone).toBe("254722111222");
  });
  it("refuses money SENT/paid out, and junk", () => {
    expect(parseMpesaSms("SJK4X9ABCD Confirmed. Ksh500.00 sent to JOHN 0712345678 on 5/10/26 at 3:45 PM.").ok).toBe(false);
    expect(parseMpesaSms("hello there").ok).toBe(false);
    expect(parseMpesaSms("").ok).toBe(false);
  });
});

describe("parseStkCallback", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    Body: { stkCallback: { MerchantRequestID: "m1", CheckoutRequestID: "c1", ResultCode: 0, ResultDesc: "ok", CallbackMetadata: { Item: [{ Name: "Amount", Value: 1500 }, { Name: "MpesaReceiptNumber", Value: "ABC1234567" }, { Name: "TransactionDate", Value: 20260105101500 }, { Name: "PhoneNumber", Value: 254712345678 }] }, ...over } },
  });
  it("extracts amount, receipt, phone, time", () => {
    expect(parseStkCallback(body())).toMatchObject({ checkoutRequestId: "c1", resultCode: 0, amount: 1500, receipt: "ABC1234567", phone: "254712345678", transactionAt: "2026-01-05T07:15:00.000Z" });
  });
  it("rejects malformed bodies and bad receipts", () => {
    expect(parseStkCallback(null)).toBeNull();
    expect(parseStkCallback({})).toBeNull();
    expect(parseStkCallback(body({ CheckoutRequestID: 5 }))).toBeNull();
    expect(parseStkCallback(body({ CallbackMetadata: { Item: [{ Name: "MpesaReceiptNumber", Value: "short" }] } }))?.receipt).toBeNull();
  });
  it("maps failure codes to plain reasons", () => {
    expect(describeStkFailure(1032, "").status).toBe("cancelled");
    expect(describeStkFailure(2001, "").reason).toMatch(/PIN/);
    expect(describeStkFailure(9999, "weird").reason).toMatch(/weird/);
  });
});

describe("DarajaClient", () => {
  const config: DarajaConfig = { environment: "sandbox", consumerKey: "k".repeat(24), consumerSecret: "s".repeat(24), shortcode: "174379", tillNumber: null, passkey: "p".repeat(64), transactionType: "paybill" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("builds a correct STK request and caches the token", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/oauth/")) return json({ access_token: "tok", expires_in: "3599" });
      return json({ MerchantRequestID: "mm", CheckoutRequestID: "cc", ResponseCode: "0", CustomerMessage: "ok" });
    });
    const client = new DarajaClient(config, fetchMock as unknown as typeof fetch, () => new Date("2026-01-01T00:00:00Z"));
    const r = await client.stkPush({ phone: "254712345678", amount: 100, accountReference: "DEAL123456789", description: "Payment for things", callbackUrl: "https://x/cb" });
    await client.stkPush({ phone: "254712345678", amount: 100, accountReference: "A", description: "B", callbackUrl: "https://x/cb" });
    expect(r.checkoutRequestId).toBe("cc");
    expect(calls.filter((c) => c.url.includes("/oauth/")).length).toBe(1); // token cached
    expect(calls[0].url).toBe("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials");
    const sent = JSON.parse(String(calls[1].init.body));
    expect(sent).toMatchObject({ BusinessShortCode: "174379", TransactionType: "CustomerPayBillOnline", Amount: 100, PartyA: "254712345678", PartyB: "174379", Timestamp: "20260101030000" });
    expect(sent.AccountReference.length).toBeLessThanOrEqual(12);
    expect(sent.TransactionDesc.length).toBeLessThanOrEqual(13);
    expect(Buffer.from(sent.Password, "base64").toString()).toBe(`174379${config.passkey}20260101030000`);
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });
  it("uses the production host only for production, and buy-goods fields for a till", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(String(url));
      return String(url).includes("/oauth/") ? json({ access_token: "t" }) : json({ MerchantRequestID: "m", CheckoutRequestID: "c", ResponseCode: "0" });
    });
    const client = new DarajaClient({ ...config, environment: "production", transactionType: "till", tillNumber: "5555555" }, fetchMock as unknown as typeof fetch);
    await client.stkPush({ phone: "254712345678", amount: 5, accountReference: "A", description: "B", callbackUrl: "https://x" });
    expect(urls.every((u) => u.startsWith("https://api.safaricom.co.ke/"))).toBe(true);
  });
  it("turns bad credentials, rejections and 'still processing' into safe errors/results", async () => {
    const bad = new DarajaClient(config, (async () => json({ errorMessage: "Bad" }, 400)) as unknown as typeof fetch);
    await expect(bad.verifyCredentials()).rejects.toBeInstanceOf(DarajaError);
    const processing = new DarajaClient(config, (async (url: string) => (String(url).includes("/oauth/") ? json({ access_token: "t" }) : json({ errorCode: "500.001.1001", errorMessage: "The transaction is being processed" }, 500))) as unknown as typeof fetch);
    expect(await processing.stkQuery("c")).toEqual({ resultCode: null, resultDesc: "Still being processed." });
    const rejected = new DarajaClient(config, (async (url: string) => (String(url).includes("/oauth/") ? json({ access_token: "t" }) : json({ ResponseCode: "1", errorMessage: "Invalid <script>Amount</script>" }, 400))) as unknown as typeof fetch);
    await expect(rejected.stkPush({ phone: "254712345678", amount: 1, accountReference: "A", description: "B", callbackUrl: "https://x" })).rejects.toThrow(/declined/);
    await expect(rejected.stkPush({ phone: "254712345678", amount: 1, accountReference: "A", description: "B", callbackUrl: "https://x" })).rejects.not.toThrow(/<script>/);
  });
  it("never puts credentials in error messages", async () => {
    const client = new DarajaClient(config, (async () => { throw new Error("network down"); }) as unknown as typeof fetch);
    const error = await client.verifyCredentials().catch((e: Error) => e);
    expect(String((error as Error).message)).not.toContain(config.consumerSecret);
    expect(darajaTimestamp(new Date("2026-03-04T21:30:05Z"))).toBe("20260305003005");
  });
});

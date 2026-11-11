/**
 * Mission 040 — a small, strict client for Safaricom's Daraja M-Pesa Express (STK push) API.
 *
 * Security posture: the base URL comes ONLY from the `environment` enum (never from user input, so no SSRF); every call has a
 * timeout; credentials are used only to build requests and are never logged or put in error messages; provider error text is
 * passed through a sanitizer before it can reach a user.
 */
export type DarajaEnvironment = "sandbox" | "production";
export type DarajaTransactionType = "paybill" | "till";

export type DarajaConfig = {
  environment: DarajaEnvironment;
  consumerKey: string;
  consumerSecret: string;
  /** BusinessShortCode: paybill number, or the store number for a buy-goods till. */
  shortcode: string;
  /** PartyB: the till number when it differs from the store number. */
  tillNumber: string | null;
  passkey: string;
  transactionType: DarajaTransactionType;
};

export class DarajaError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "auth" | "rejected" | "processing" | "unknown" = "unknown"
  ) {
    super(message);
    this.name = "DarajaError";
  }
}

export type StkPushRequest = { phone: string; amount: number; accountReference: string; description: string; callbackUrl: string };
export type StkPushResponse = { merchantRequestId: string; checkoutRequestId: string; customerMessage: string };
/** resultCode null = Safaricom says the transaction is still being processed. */
export type StkQueryResponse = { resultCode: number | null; resultDesc: string };

export interface MpesaClient {
  verifyCredentials(): Promise<void>;
  stkPush(request: StkPushRequest): Promise<StkPushResponse>;
  stkQuery(checkoutRequestId: string): Promise<StkQueryResponse>;
}

const BASE_URL: Record<DarajaEnvironment, string> = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};
const TIMEOUT_MS = 15_000;

/** Daraja timestamps are yyyyMMddHHmmss in East Africa Time. */
export function darajaTimestamp(now: Date = new Date()): string {
  const eat = new Date(now.getTime() + 3 * 3600_000);
  return eat.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

export function safeProviderText(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  return raw.replace(/[^\w\s.,:;()'"/-]/g, "").slice(0, 160).trim();
}

export class DarajaClient implements MpesaClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: DarajaConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly nowFn: () => Date = () => new Date()
  ) {}

  private get base(): string {
    return BASE_URL[this.config.environment];
  }

  private async request(path: string, init: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new DarajaError("Could not reach M-Pesa. Please try again in a moment.", "network");
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, body };
  }

  private async getToken(): Promise<string> {
    const now = this.nowFn().getTime();
    if (this.token && this.token.expiresAt > now + 30_000) return this.token.value;
    const basic = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString("base64");
    const { status, body } = await this.request("/oauth/v1/generate?grant_type=client_credentials", { method: "GET", headers: { authorization: `Basic ${basic}` } });
    const accessToken = typeof body.access_token === "string" ? body.access_token : null;
    if (status !== 200 || !accessToken) throw new DarajaError("M-Pesa rejected these credentials. Check the consumer key, secret and environment.", "auth");
    const ttl = Number.parseInt(String(body.expires_in ?? "3599"), 10);
    this.token = { value: accessToken, expiresAt: now + (Number.isFinite(ttl) ? ttl : 3599) * 1000 };
    return accessToken;
  }

  async verifyCredentials(): Promise<void> {
    await this.getToken();
  }

  private passwordAndTimestamp(): { password: string; timestamp: string } {
    const timestamp = darajaTimestamp(this.nowFn());
    return { password: Buffer.from(`${this.config.shortcode}${this.config.passkey}${timestamp}`).toString("base64"), timestamp };
  }

  async stkPush(request: StkPushRequest): Promise<StkPushResponse> {
    const token = await this.getToken();
    const { password, timestamp } = this.passwordAndTimestamp();
    const { status, body } = await this.request("/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: this.config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: this.config.transactionType === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
        Amount: request.amount,
        PartyA: request.phone,
        PartyB: this.config.transactionType === "till" ? (this.config.tillNumber ?? this.config.shortcode) : this.config.shortcode,
        PhoneNumber: request.phone,
        CallBackURL: request.callbackUrl,
        AccountReference: request.accountReference.slice(0, 12),
        TransactionDesc: request.description.slice(0, 13),
      }),
    });
    const merchantRequestId = typeof body.MerchantRequestID === "string" ? body.MerchantRequestID : null;
    const checkoutRequestId = typeof body.CheckoutRequestID === "string" ? body.CheckoutRequestID : null;
    if (status !== 200 || String(body.ResponseCode) !== "0" || !merchantRequestId || !checkoutRequestId) {
      const detail = safeProviderText(body.errorMessage ?? body.ResponseDescription);
      throw new DarajaError(detail ? `M-Pesa declined the request: ${detail}` : "M-Pesa declined the request.", "rejected");
    }
    return { merchantRequestId, checkoutRequestId, customerMessage: safeProviderText(body.CustomerMessage) };
  }

  async stkQuery(checkoutRequestId: string): Promise<StkQueryResponse> {
    const token = await this.getToken();
    const { password, timestamp } = this.passwordAndTimestamp();
    const { status, body } = await this.request("/mpesa/stkpushquery/v1/query", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ BusinessShortCode: this.config.shortcode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId }),
    });
    // While the customer is still deciding, Daraja answers with an error body instead of a result.
    if (status !== 200) {
      if (String(body.errorCode ?? "").includes("1001")) return { resultCode: null, resultDesc: "Still being processed." };
      throw new DarajaError("Could not check the payment status with M-Pesa.", "unknown");
    }
    const code = Number.parseInt(String(body.ResultCode ?? ""), 10);
    return { resultCode: Number.isFinite(code) ? code : null, resultDesc: safeProviderText(body.ResultDesc) };
  }
}

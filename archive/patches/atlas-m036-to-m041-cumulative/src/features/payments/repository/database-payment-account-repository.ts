import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { paymentAccounts } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-box";
import type { DarajaConfig, DarajaEnvironment, DarajaTransactionType } from "../mpesa/daraja-client";

/** What the UI may see: never any secret. */
export type PaymentAccountPublic = {
  environment: DarajaEnvironment;
  shortcode: string;
  tillNumber: string | null;
  transactionType: DarajaTransactionType;
  connectedAt: string;
};

export type SavePaymentAccountInput = Omit<DarajaConfig, "environment" | "transactionType"> & {
  environment: DarajaEnvironment;
  transactionType: DarajaTransactionType;
};

/**
 * Mission 040 — a business's own Daraja credentials. Secrets are AES-256-GCM encrypted (Mission 037 secret box) and
 * decrypted only inside this class when a request to Safaricom is about to be made. If decryption fails (wrong key,
 * tampering) the account reads as "not connected" rather than leaking an error with key material.
 */
export class DatabasePaymentAccountRepository {
  constructor(private readonly businessId: string) {}

  async getPublic(): Promise<PaymentAccountPublic | null> {
    const row = (await db.select().from(paymentAccounts).where(eq(paymentAccounts.businessId, this.businessId)).limit(1))[0];
    if (!row) return null;
    return {
      environment: row.environment as DarajaEnvironment,
      shortcode: row.shortcode,
      tillNumber: row.tillNumber,
      transactionType: row.transactionType as DarajaTransactionType,
      connectedAt: row.createdAt,
    };
  }

  async getWithSecrets(): Promise<{ config: DarajaConfig; callbackToken: string } | null> {
    const row = (await db.select().from(paymentAccounts).where(eq(paymentAccounts.businessId, this.businessId)).limit(1))[0];
    if (!row) return null;
    try {
      return {
        callbackToken: row.callbackToken,
        config: {
          environment: row.environment as DarajaEnvironment,
          shortcode: row.shortcode,
          tillNumber: row.tillNumber,
          transactionType: row.transactionType as DarajaTransactionType,
          consumerKey: decryptSecret(row.consumerKeyEnc),
          consumerSecret: decryptSecret(row.consumerSecretEnc),
          passkey: decryptSecret(row.passkeyEnc),
        },
      };
    } catch {
      return null;
    }
  }

  /** Upserts. Replacing credentials ROTATES the callback token, so callbacks addressed to the old URL stop being accepted. */
  async save(input: SavePaymentAccountInput): Promise<void> {
    const now = new Date().toISOString();
    const values = {
      businessId: this.businessId,
      provider: "mpesa_daraja",
      environment: input.environment,
      shortcode: input.shortcode,
      tillNumber: input.tillNumber,
      transactionType: input.transactionType,
      consumerKeyEnc: encryptSecret(input.consumerKey),
      consumerSecretEnc: encryptSecret(input.consumerSecret),
      passkeyEnc: encryptSecret(input.passkey),
      callbackToken: randomBytes(24).toString("hex"),
      updatedAt: now,
    };
    const existing = await this.getPublic();
    if (existing) await db.update(paymentAccounts).set(values).where(eq(paymentAccounts.businessId, this.businessId));
    else await db.insert(paymentAccounts).values(values);
  }

  async remove(): Promise<void> {
    await db.delete(paymentAccounts).where(eq(paymentAccounts.businessId, this.businessId));
  }
}

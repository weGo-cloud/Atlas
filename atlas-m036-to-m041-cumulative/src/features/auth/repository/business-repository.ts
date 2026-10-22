import type { Business, WebsiteMode } from "../domain/business";

export type UpdateBusinessSettingsInput = {
  websiteMode?: WebsiteMode;
  /** Mission 037 — already-normalized origins (see domain/api-origins.ts); pass [] to clear the restriction. */
  publicApiAllowedOrigins?: string[];
};

export interface BusinessRepository {
  getById(id: string): Promise<Business | null>;
  /**
   * Mission 027 (correction) / Mission 037 — looks a business up by its public integration API key.
   * The key is hashed before lookup (only the SHA-256 is stored). A business still holding a legacy
   * plaintext key is upgraded in place on first use. Returns null for an unset/unknown key.
   */
  getByPublicApiKey(apiKey: string): Promise<Business | null>;
  /** Mission 028 — also creates that business's `subscriptions` row (see DatabaseBusinessRepository) so a business is never observably without one. */
  create(input: { name: string }): Promise<Business>;
  /** Mission 027 (correction) — the one place website-mode/origin settings are written. Plan/subscription settings are NOT here — see entitlements/repository/subscription-repository.ts. */
  updateSettings(id: string, input: UpdateBusinessSettingsInput): Promise<Business | null>;
  /** Mission 037 — stores the key's hash + display hint (never the plaintext), replacing any previous key. The caller shows the plaintext to the owner once. */
  setPublicApiKey(id: string, apiKey: string): Promise<Business | null>;
  /** Mission 037 — revokes the key: hash, hint and any legacy plaintext are all cleared. */
  clearPublicApiKey(id: string): Promise<Business | null>;
}

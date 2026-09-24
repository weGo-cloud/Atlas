import type { Business, WebsiteMode } from "../domain/business";

export type UpdateBusinessSettingsInput = {
  websiteMode?: WebsiteMode;
  /** Pass `null` to revoke the current key without issuing a new one. */
  publicApiKey?: string | null;
};

export interface BusinessRepository {
  getById(id: string): Promise<Business | null>;
  /** Mission 027 (correction) — looks a business up by its public integration API key, for the external-integration route handlers. Returns null for an unset/unknown key so callers never need to special-case an empty string. */
  getByPublicApiKey(apiKey: string): Promise<Business | null>;
  /** Mission 028 — also creates that business's `subscriptions` row (see DatabaseBusinessRepository) so a business is never observably without one. */
  create(input: { name: string }): Promise<Business>;
  /** Mission 027 (correction) — the one place website-mode/API-key settings are written; keeps every future setting behind a single typed update rather than a growing list of one-off setter methods. Plan/subscription settings are NOT here — see entitlements/repository/subscription-repository.ts, a deliberately separate write path (Mission 028, Section 10's plan-vs-subscription split). */
  updateSettings(id: string, input: UpdateBusinessSettingsInput): Promise<Business | null>;
}

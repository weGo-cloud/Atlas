export const WEBSITE_MODES = ["none", "own_website", "atlas_hosted"] as const;
export type WebsiteMode = (typeof WEBSITE_MODES)[number];

export function isWebsiteMode(value: string): value is WebsiteMode {
  return (WEBSITE_MODES as readonly string[]).includes(value);
}

export type Business = {
  id: string;
  name: string;
  /** Mission 027 (correction) — only "auto" exists today; see conversion/domain/vertical.ts. */
  vertical: string;
  /** Mission 028 — see schema.ts's doc comment on the column for the three-state rationale. */
  websiteMode: WebsiteMode;
  /**
   * Mission 037 — display-only hint of the public integration API key
   * (`wego_live_ab12…9f3e`), null when no key exists. The plaintext key is
   * never stored or returned after creation; only its SHA-256 is kept.
   */
  publicApiKeyHint: string | null;
  /** Mission 037 — browser origins allowed to use the public API key; empty = no browser-origin restriction. */
  publicApiAllowedOrigins: string[];
  createdAt: string;
  updatedAt: string;
};

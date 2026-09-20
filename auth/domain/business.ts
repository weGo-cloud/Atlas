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
  /** Mission 027 (correction) — null until generated via settings; authorizes the public integration API for this business. */
  publicApiKey: string | null;
  createdAt: string;
  updatedAt: string;
};

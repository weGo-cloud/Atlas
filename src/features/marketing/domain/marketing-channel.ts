/**
 * Mission 031, Section 7 — "where Meta is the underlying API for
 * Facebook/Instagram, avoid creating duplicate integration
 * architectures." The spec's three-lane diagram (Social/Meta/
 * WhatsApp) collapses to two real integration surfaces: organic
 * Facebook/Instagram posting and WhatsApp messaging are both Meta
 * Graph API products, so "Social Media Publishing" and "Meta
 * Distribution" are the same channel here, not two. WhatsApp Business
 * Cloud API is also technically part of the Graph API family but is a
 * genuinely distinct product surface (phone-number messaging vs. a
 * Page's feed) with its own connection/consent model, so it stays a
 * separate channel — see channels/meta-graph-client.ts for the one
 * shared low-level HTTP/auth helper both channel providers use, which
 * is the actual de-duplication this section asks for.
 */
export const MARKETING_CHANNELS = ["meta", "whatsapp"] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export function isMarketingChannel(value: unknown): value is MarketingChannel {
  return typeof value === "string" && (MARKETING_CHANNELS as readonly string[]).includes(value);
}

export const CHANNEL_LABEL: Record<MarketingChannel, string> = {
  meta: "Meta (Facebook & Instagram)",
  whatsapp: "WhatsApp",
};

/**
 * Mission 031, Section 15 — "external integrations should have
 * understandable states... do not show 'Connected' unless the
 * application can actually verify the connection."
 * - not_connected: no connection has been established for this business.
 * - connected: a real, currently-valid credential is on file.
 * - needs_attention: was connected, but the last real call indicated a
 *   recoverable problem (e.g. a permission was revoked).
 * - configuration_error: the *platform* isn't set up to support this
 *   channel at all yet (e.g. no META_APP_ID configured for this
 *   environment) — distinct from needs_attention, which is about one
 *   business's own connection, not Atlas's own configuration.
 */
export const CONNECTION_STATUSES = ["not_connected", "connected", "needs_attention", "configuration_error"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  not_connected: "Not connected",
  connected: "Connected",
  needs_attention: "Needs attention",
  configuration_error: "Configuration error",
};

export type MarketingChannelConnection = {
  id: string;
  businessId: string;
  channel: MarketingChannel;
  status: ConnectionStatus;
  externalAccountLabel: string | null;
  updatedAt: string;
};

/** Mission 031, Section 16/17 — "simulated" is its own status, not a variant of "published", precisely so a status check alone can never treat one as the other. */
export const PUBLICATION_STATUSES = ["simulated", "published", "failed"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export type MarketingPublication = {
  id: string;
  businessId: string;
  marketingContentId: string;
  channel: MarketingChannel;
  status: PublicationStatus;
  isSimulated: boolean;
  externalId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

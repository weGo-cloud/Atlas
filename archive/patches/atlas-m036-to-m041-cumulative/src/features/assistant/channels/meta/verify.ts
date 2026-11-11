import { MetaGraphApiError, graphApiGet } from "@/features/marketing/channels/meta-graph-client";

export type MetaVerification = { ok: true; pageName: string | null } | { ok: false; message: string };

type Getter = typeof graphApiGet;

/**
 * Mission 039 — proves a Page access token really belongs to the Page (and Instagram account) a business is
 * claiming, BEFORE inbound messages are routed to that business. Without this, one business could type
 * another business's public Page id into its settings and receive that Page's customer messages.
 * A Page access token's `/me` is the Page itself, so `me.id` must equal the claimed Page id.
 */
export async function verifyMetaConnection(
  accessToken: string,
  pageId: string,
  instagramAccountId: string | null,
  get: Getter = graphApiGet
): Promise<MetaVerification> {
  try {
    const me = await get<{ id?: string; name?: string }>("me", accessToken, { fields: "id,name" });
    if (me.id !== pageId) return { ok: false, message: "That access token doesn't belong to this Page. Generate a Page access token for the Page ID you entered." };

    if (instagramAccountId) {
      const page = await get<{ instagram_business_account?: { id?: string } }>(pageId, accessToken, { fields: "instagram_business_account" });
      if (page.instagram_business_account?.id !== instagramAccountId) {
        return { ok: false, message: "That Instagram account isn't linked to this Page. Link it in Meta Business Suite first." };
      }
    }
    return { ok: true, pageName: me.name ?? null };
  } catch (error) {
    if (error instanceof MetaGraphApiError) return { ok: false, message: `Meta couldn't verify the token: ${error.message}` };
    return { ok: false, message: "Could not verify the token with Meta. Please try again." };
  }
}

import { notFound } from "next/navigation";

import { getConversionService } from "@/features/conversion/service";
import { StorefrontCatalog } from "@/features/conversion/components/storefront-catalog";
import { StorefrontChatWidget } from "@/features/assistant/components/storefront-chat-widget";
import { getAssistantService } from "@/features/assistant/service/assistant-service";

export const metadata = { title: "Available Inventory" };

/**
 * Mission 027 (correction) — the Atlas-hosted public storefront: the
 * customer-facing entry point Atlas provides for a dealer that
 * doesn't have their own website. Deliberately outside `/app` (see
 * middleware.ts's PROTECTED_PREFIX) — no session is expected or
 * required here, and none of the business data it shows goes beyond
 * what ConversionService.getPublicCatalog already scopes to
 * currently-available items.
 *
 * A dealer that *does* have a website is expected to use the
 * external-integration API (see src/app/api/public/v1) from their own
 * site instead of sending customers here — this page and that API are
 * two channels into the exact same ConversionService, gated by two
 * different entitlement features, not two different products.
 *
 * Mission 030 — this page itself has no vertical-specific code (it
 * never hard-codes "vehicle" or "furniture"); it only renders whatever
 * `itemNounSingular`/`itemNounPlural`/`CatalogItem[]` the resolved
 * adapter produced. Onboarding the Furniture vertical required zero
 * changes here beyond fixing a pre-existing hardcode (see below).
 */
export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const conversionService = getConversionService();

  const channelResult = await conversionService.resolveChannel(businessId, "storefront");
  if (!channelResult.ok) {
    notFound();
  }

  const business = channelResult.data;
  const { items, itemNounSingular, itemNounPlural } = await conversionService.getPublicCatalog(business);

  // Mission 033 — the chat launcher appears only when the assistant can genuinely answer
  // (enabled, supported vertical, AI configured). Otherwise the page is exactly as before.
  const assistantService = getAssistantService(business.id);
  const assistantAvailable = (await assistantService.getAvailability()).available;
  const assistantGreeting = assistantAvailable ? await assistantService.getGreeting() : "";

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{business.name}</h1>
        <p className="text-sm text-muted-foreground">
          {items.length > 0
            ? `${items.length} ${items.length === 1 ? itemNounPlural.replace(/s$/, "") : itemNounPlural} currently available.`
            : `No ${itemNounPlural} are currently listed — check back soon, or reach out below.`}
        </p>
      </header>

      <StorefrontCatalog businessId={business.id} items={items} itemNounSingular={itemNounSingular} />

      {assistantAvailable ? (
        <StorefrontChatWidget businessId={business.id} businessName={business.name} greeting={assistantGreeting} />
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import { StorefrontLeadForm } from "./storefront-lead-form";
import type { CatalogItem } from "../domain/catalog-adapter";

/**
 * Mission 030, Section 11 — closes the loop the mission spec
 * describes: "Furniture Product → customer clicks enquiry/contact →
 * Lead created ... associated with furniture product." Before this,
 * the storefront's lead form was always generic (no `catalogItemId`
 * was ever passed from the page), so every public lead lost which
 * item it was about. This wrapper lifts a `selectedItemId` into
 * client state shared between the item grid and the form — clicking
 * "Enquire" on a card scrolls to and pre-selects that item; the form
 * still works with nothing selected (a general enquiry), matching the
 * previous behavior exactly for that case.
 *
 * Applies to both verticals identically — nothing here is Auto- or
 * Furniture-specific, it only reads whatever `itemNounSingular` /
 * `itemNounPlural` / `CatalogItem` the resolved adapter produced.
 */
export function StorefrontCatalog({
  businessId,
  items,
  itemNounSingular,
}: {
  businessId: string;
  items: CatalogItem[];
  itemNounSingular: string;
}) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  // Mission 033 — the chat assistant's "Enquire about this" hands a piece to this form.
  useEffect(() => {
    function onEnquire(event: Event) {
      const itemId = (event as CustomEvent<{ itemId?: string }>).detail?.itemId;
      if (typeof itemId !== "string") return;
      setSelectedItemId(itemId);
      document.getElementById("storefront-enquiry-form")?.scrollIntoView({ behavior: "smooth" });
    }
    window.addEventListener("atlas:enquire-item", onEnquire);
    return () => window.removeEventListener("atlas:enquire-item", onEnquire);
  }, []);

  return (
    <>
      {items.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface shadow-sm ${
                item.id === selectedItemId ? "border-primary ring-1 ring-primary" : "border-border"
              }`}
            >
              {item.imageUrl ? (
                <div className="aspect-[16/10] w-full shrink-0 overflow-hidden bg-surface-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- external/local upload URL, not an optimizable next/image asset in this context. */}
                  <img src={item.imageUrl} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
                </div>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                <p className="line-clamp-2 font-medium text-foreground">{item.title}</p>
                {item.subtitle ? <p className="line-clamp-2 text-sm text-muted-foreground">{item.subtitle}</p> : null}
                <p className="text-sm font-semibold tabular text-foreground">{item.priceLabel}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItemId(item.id);
                    document.getElementById("storefront-enquiry-form")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="mt-auto self-start rounded-sm pt-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Enquire about this {itemNounSingular}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <section id="storefront-enquiry-form" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Get in touch</h2>
          <p className="text-sm text-muted-foreground">
            {selectedItem
              ? `Asking about: ${selectedItem.title}. `
              : ""}
            Leave your details and we&apos;ll follow up.
          </p>
          {selectedItem ? (
            <button
              type="button"
              onClick={() => setSelectedItemId(null)}
              className="mt-1 text-xs text-muted-foreground underline"
            >
              Clear selection — send a general enquiry instead
            </button>
          ) : null}
        </div>
        <StorefrontLeadForm
          businessId={businessId}
          itemNounSingular={itemNounSingular}
          catalogItemId={selectedItemId ?? undefined}
        />
      </section>
    </>
  );
}

"use client";

import { useState } from "react";

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

  return (
    <>
      {items.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex flex-col gap-2 overflow-hidden rounded-lg border p-4 ${
                item.id === selectedItemId ? "border-primary" : "border-border"
              }`}
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external/local upload URL, not an optimizable next/image asset in this context.
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="-mx-4 -mt-4 mb-1 h-40 w-[calc(100%+2rem)] object-cover"
                />
              ) : null}
              <p className="font-medium text-foreground">{item.title}</p>
              {item.subtitle ? <p className="text-sm text-muted-foreground">{item.subtitle}</p> : null}
              <p className="text-sm font-semibold text-foreground">{item.priceLabel}</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedItemId(item.id);
                  document.getElementById("storefront-enquiry-form")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="mt-1 self-start text-sm font-medium text-primary hover:underline"
              >
                Enquire about this {itemNounSingular}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <section id="storefront-enquiry-form" className="flex flex-col gap-4 rounded-lg border border-border p-6">
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FURNITURE_CATEGORY_LABEL,
  FURNITURE_CONDITION_LABEL,
  type FurnitureProduct,
} from "../domain/furniture-product";
import type { FurnitureProductPhoto } from "../domain/furniture-product-photo";
import { formatAddedDate, formatFurniturePrice } from "../lib/format";
import { FurnitureStatusBadge } from "./status-badge";
import { FurniturePhotoManager } from "./furniture-photo-manager";
import { FurnitureDeleteDialog } from "./furniture-delete-dialog";
import { MarketingPanel } from "@/features/marketing/components/marketing-panel";
import type { MarketingContent } from "@/features/marketing/domain/marketing-content";
import type {
  ConnectionStatus,
  MarketingChannel,
  MarketingPublication,
} from "@/features/marketing/domain/marketing-channel";

export type FurnitureLeadSummary = {
  id: string;
  customerName: string;
  status: string;
  createdAt: string;
};

/**
 * Mission 030, Section 10 — "a useful product presentation... should
 * feel like an actual commercial furniture catalogue rather than an
 * administrative database screen." This is the staff-facing (in-app,
 * authenticated) equivalent of Vehicle's `/app/inventory/[id]` page —
 * unlike CatalogItem's public storefront listing, this shows every
 * field a dealer needs to manage the product, plus which leads it has
 * generated (Section 13).
 */
export function FurnitureProductDetail({
  product,
  photos,
  leads,
  canDelete,
  marketing,
}: {
  product: FurnitureProduct;
  photos: FurnitureProductPhoto[];
  leads: FurnitureLeadSummary[];
  canDelete: boolean;
  marketing: {
    content: MarketingContent | null;
    publications: MarketingPublication[];
    channelStatuses: Record<MarketingChannel, ConnectionStatus>;
    canUseMarketing: boolean;
  };
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{product.name}</h1>
            <FurnitureStatusBadge status={product.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {FURNITURE_CATEGORY_LABEL[product.category]} · {FURNITURE_CONDITION_LABEL[product.condition]} · Added{" "}
            {formatAddedDate(product.addedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/app/inventory/${product.id}/edit`}>Edit</Link>
          </Button>
          {canDelete ? (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Photos</CardTitle>
            </CardHeader>
            <CardContent>
              <FurniturePhotoManager productId={product.id} initialPhotos={photos} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {product.description || "No description provided."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enquiries</CardTitle>
            </CardHeader>
            <CardContent>
              {leads.length === 0 ? (
                <p className="text-sm text-muted-foreground">No enquiries for this product yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {leads.map((lead) => (
                    <li key={lead.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                      <Link href={`/app/leads/${lead.id}`} className="font-medium text-foreground hover:underline">
                        {lead.customerName}
                      </Link>
                      <span className="text-muted-foreground">
                        {lead.status} · {formatAddedDate(lead.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <Detail label="Price" value={formatFurniturePrice(product.price, product.currency)} />
              <Detail label="Material" value={product.material} />
              <Detail label="Color" value={product.color} />
              <Detail label="Dimensions" value={product.dimensions} />
              <Detail label="SKU" value={product.sku} />
            </dl>
          </CardContent>
        </Card>

        <MarketingPanel
          itemRef={{ itemType: "furniture_product", itemId: product.id }}
          currentItemUpdatedAt={product.updatedAt}
          initialContent={marketing.content}
          initialPublications={marketing.publications}
          initialChannelStatuses={marketing.channelStatuses}
          canUseMarketing={marketing.canUseMarketing}
        />
      </div>

      <FurnitureDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        productId={product.id}
        name={product.name}
        redirectTo="/app/inventory"
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{value || "—"}</dd>
    </div>
  );
}

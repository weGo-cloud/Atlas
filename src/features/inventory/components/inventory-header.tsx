import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

function InventoryHeader() {
  return (
    <PageHeader
      className="mb-0"
      title="Inventory"
      description="Manage vehicles, pricing, availability, and listing status."
      actions={
        <Button asChild className="gap-1.5">
          <Link href="/app/inventory/new">
            <Plus className="h-4 w-4" />
            Add vehicle
          </Link>
        </Button>
      }
    />
  );
}

export { InventoryHeader };

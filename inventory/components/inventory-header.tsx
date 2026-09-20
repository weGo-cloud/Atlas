import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

function InventoryHeader() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Inventory
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage vehicles, pricing, availability, and listing status.
        </p>
      </div>
      <Button asChild className="gap-1.5 self-start">
        <Link href="/app/inventory/new">
          <Plus className="h-4 w-4" />
          Add vehicle
        </Link>
      </Button>
    </div>
  );
}

export { InventoryHeader };

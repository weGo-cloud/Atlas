import { PackageSearch } from "lucide-react";

import { Button } from "@/components/ui/button";

function InventoryEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-subtle-foreground">
        <PackageSearch className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          No vehicles found
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          No vehicles match your search and filters. Try adjusting them.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onReset}>
        Reset filters
      </Button>
    </div>
  );
}

export { InventoryEmptyState };

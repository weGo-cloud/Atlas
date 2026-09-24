import { PackageSearch } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

function InventoryEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <EmptyState
      icon={PackageSearch}
      title="No vehicles found"
      description="No vehicles match your search and filters. Try adjusting them."
      action={
        <Button variant="outline" size="sm" onClick={onReset}>
          Reset filters
        </Button>
      }
    />
  );
}

export { InventoryEmptyState };

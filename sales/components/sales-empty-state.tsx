import { Trophy } from "lucide-react";

function SalesEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-subtle-foreground">
        <Trophy className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No sales yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Finalize a completed deal to record your first sale.
        </p>
      </div>
    </div>
  );
}

export { SalesEmptyState };

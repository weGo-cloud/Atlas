import { Users } from "lucide-react";

function LeadsEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-subtle-foreground">
        <Users className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No leads found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtered
            ? "No leads match this status. Try a different filter."
            : "Add a customer interest from a vehicle page to create your first lead."}
        </p>
      </div>
    </div>
  );
}

export { LeadsEmptyState };

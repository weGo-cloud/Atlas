function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-sm bg-surface-2 ${className}`} />
  );
}

function InventoryLoading() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="mt-2 h-7 w-12" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0"
          >
            <SkeletonBlock className="h-9 w-9 shrink-0 rounded-md" />
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="hidden h-4 w-20 sm:block" />
            <SkeletonBlock className="ml-auto h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export { InventoryLoading };

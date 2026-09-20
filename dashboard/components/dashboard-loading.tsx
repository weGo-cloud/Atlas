function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-sm bg-surface-2 ${className}`} />
  );
}

function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="mt-2 h-4 w-64" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <SkeletonBlock className="h-3 w-16" />
            <SkeletonBlock className="mt-2 h-6 w-14" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="mt-4 h-2.5 w-full rounded-full" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="mt-4 h-2 w-full" />
        </div>
      </div>
    </div>
  );
}

export { DashboardLoading };

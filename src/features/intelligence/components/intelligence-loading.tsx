function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-surface-2 ${className}`} />;
}

/** Mirrors AnalyticsLoading's skeleton shape, sized for the summary strip + a stack of signal cards this page renders. */
export function IntelligenceLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="mt-2 h-4 w-64" />
        </div>
        <SkeletonBlock className="h-9 w-[180px]" />
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <SkeletonBlock className="h-10 w-full" />
      </div>

      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-border bg-surface p-5">
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="mt-2 h-3 w-2/3" />
            <SkeletonBlock className="mt-4 h-20 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

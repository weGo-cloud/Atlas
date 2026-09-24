function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-surface-2 ${className}`} />;
}

function SalesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <SkeletonBlock className="h-6 w-24" />
        <SkeletonBlock className="mt-2 h-4 w-64" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-surface-2/50 p-3">
          <SkeletonBlock className="h-4 w-full" />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="border-b border-border p-3 last:border-b-0">
            <SkeletonBlock className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export { SalesLoading };

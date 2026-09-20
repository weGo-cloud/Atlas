function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-surface-2 ${className}`} />;
}

function CustomerDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonBlock className="h-4 w-32" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <SkeletonBlock className="h-7 w-48" />
          <SkeletonBlock className="mt-2 h-4 w-40" />
        </div>
        <SkeletonBlock className="h-9 w-24 rounded-md" />
      </div>

      <SkeletonBlock className="h-24 w-full rounded-lg" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-16 rounded-lg" />
        ))}
      </div>

      <SkeletonBlock className="h-40 w-full rounded-lg" />
      <SkeletonBlock className="h-40 w-full rounded-lg" />
    </div>
  );
}

export { CustomerDetailLoading };

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-sm bg-surface-2 ${className}`} />
  );
}

function VehicleDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <SkeletonBlock className="h-4 w-32" />
        <div className="flex items-start justify-between">
          <div>
            <SkeletonBlock className="h-7 w-48" />
            <SkeletonBlock className="mt-2 h-4 w-36" />
          </div>
          <SkeletonBlock className="h-9 w-32 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <SkeletonBlock className="aspect-[4/3] w-full rounded-lg sm:aspect-[16/10]" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="aspect-square rounded-md" />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <SkeletonBlock className="h-64 w-full rounded-lg" />
          <SkeletonBlock className="h-32 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export { VehicleDetailLoading };

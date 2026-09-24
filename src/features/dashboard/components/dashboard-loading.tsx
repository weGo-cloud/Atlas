import { Skeleton } from "@/components/ui/skeleton";

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface p-5 ${className}`}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-28" />
    </div>
  );
}

/** Mirrors the real dashboard's hierarchy so the page doesn't reflow when data arrives. */
function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8" role="status" aria-label="Loading dashboard">
      <div>
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>

      <Skeleton className="h-16 w-full rounded-lg" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5 lg:col-span-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="mt-5 h-4 w-full" />
          <Skeleton className="mt-3 h-4 w-4/5" />
          <Skeleton className="mt-3 h-4 w-3/5" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-5 h-2.5 w-full rounded-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-border bg-surface">
            <Skeleton className="aspect-[16/10] w-full rounded-none" />
            <div className="p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-3 h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { DashboardLoading };

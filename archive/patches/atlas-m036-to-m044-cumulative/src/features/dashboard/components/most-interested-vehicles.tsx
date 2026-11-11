import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Vehicle } from "@/features/inventory/data/types";

type MostInterestedVehiclesProps = {
  items: { vehicle: Vehicle; leadCount: number }[];
};

function MostInterestedVehicles({ items }: MostInterestedVehiclesProps) {
  const maxCount = items.length > 0 ? items[0].leadCount : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most interested vehicles</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No customer interest recorded yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map(({ vehicle, leadCount }) => (
              <li key={vehicle.id} className="flex min-w-0 items-center gap-3">
                <Link
                  href={`/app/inventory/${vehicle.id}`}
                  className="w-[40%] min-w-0 shrink-0 truncate rounded-sm text-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </Link>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${maxCount > 0 ? (leadCount / maxCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-sm font-medium tabular text-foreground">
                  {leadCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export { MostInterestedVehicles };

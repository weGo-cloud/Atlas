import type { ReactNode } from "react";
import Link from "next/link";
import { Car, Gauge, Hash, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Vehicle } from "../data/types";
import { formatMileage, formatPriceKsh } from "../lib/format";
import { VehicleStatusBadge } from "./status-badge";

type VehicleCardProps = {
  vehicle: Vehicle;
  /** The vehicle's primary photo, when one has been uploaded. */
  photoUrl?: string;
  /** Row-actions menu (or any secondary control), shown beside the primary action. */
  actions?: ReactNode;
  /** Enquiry count, where the caller already has it — omitted rather than guessed. */
  leadCount?: number;
  className?: string;
};

/**
 * The Atlas automotive product card. Used wherever a vehicle is shown
 * as a thing to look at (inventory grid, dashboard featured inventory),
 * so a vehicle looks like the same object everywhere.
 *
 * Containment: the photo lives in a fixed-aspect, overflow-hidden frame
 * with `object-cover`, so it can never escape the rounded corners or
 * change the card's height. The name clamps to two lines and the price
 * to one, so long data can't push cards to different heights or break
 * the row; `min-w-0` lets every flex child actually shrink.
 */
function VehicleCard({ vehicle, photoUrl, actions, leadCount, className }: VehicleCardProps) {
  const name = `${vehicle.make} ${vehicle.model}`;
  const href = `/app/inventory/${vehicle.id}`;

  return (
    <article
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow duration-200 hover:shadow-md",
        className
      )}
    >
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="relative block aspect-[16/10] w-full shrink-0 overflow-hidden bg-surface-3"
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-subtle-foreground">
            <Car className="h-10 w-10" strokeWidth={1.25} />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
              <Link
                href={href}
                className="rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {name}
              </Link>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{vehicle.year}</p>
          </div>
          <VehicleStatusBadge status={vehicle.status} />
        </div>

        <dl className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Mileage</dt>
            <Gauge aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-subtle-foreground" />
            <dd className="truncate tabular">{formatMileage(vehicle.mileage)}</dd>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Stock ID</dt>
            <Hash aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-subtle-foreground" />
            <dd className="truncate">{vehicle.stockId}</dd>
          </div>
          {leadCount !== undefined ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <dt className="sr-only">Enquiries</dt>
              <MessageSquare aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-subtle-foreground" />
              <dd className="truncate tabular">
                {leadCount} {leadCount === 1 ? "enquiry" : "enquiries"}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-auto flex min-w-0 items-center justify-between gap-2 border-t border-border pt-3">
          <p className="min-w-0 truncate text-base font-semibold tabular text-foreground">
            {formatPriceKsh(vehicle.price)}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild size="sm" variant="outline">
              <Link href={href}>View</Link>
            </Button>
            {actions}
          </div>
        </div>
      </div>
    </article>
  );
}

export { VehicleCard };

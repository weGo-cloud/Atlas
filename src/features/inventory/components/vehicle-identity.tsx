import Link from "next/link";
import { Car } from "lucide-react";

type VehicleIdentityProps = {
  make: string;
  model: string;
  year: number;
  /** When provided, renders the identity as a link to the vehicle detail page. */
  href?: string;
  /** The vehicle's primary photo, if one has been uploaded. */
  photoUrl?: string;
};

/**
 * Thumbnail + name for table rows. The thumbnail is a fixed 44px frame
 * with `object-cover` inside `overflow-hidden`, and the text column is
 * `min-w-0` so a long make/model truncates instead of widening the row.
 */
function VehicleIdentity({
  make,
  model,
  year,
  href,
  photoUrl,
}: VehicleIdentityProps) {
  const content = (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-3 text-subtle-foreground">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <Car className="h-4 w-4" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <p
          className={`truncate text-sm font-medium text-foreground ${
            href ? "transition-colors group-hover:text-primary" : ""
          }`}
        >
          {make} {model}
        </p>
        <p className="text-xs text-muted-foreground">{year}</p>
      </div>
    </div>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="group block min-w-0 max-w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {content}
    </Link>
  );
}

export { VehicleIdentity };

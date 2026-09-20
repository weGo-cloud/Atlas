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

function VehicleIdentity({
  make,
  model,
  year,
  href,
  photoUrl,
}: VehicleIdentityProps) {
  const content = (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2 text-subtle-foreground">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Car className="h-4 w-4" />
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
      className="group w-fit rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {content}
    </Link>
  );
}

export { VehicleIdentity };

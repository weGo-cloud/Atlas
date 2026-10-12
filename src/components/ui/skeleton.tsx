import * as React from "react";

import { cn } from "@/lib/utils";

/** Loading placeholder. Pulses gently; `prefers-reduced-motion` stops it globally. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface-3", className)}
      {...props}
    />
  );
}

export { Skeleton };

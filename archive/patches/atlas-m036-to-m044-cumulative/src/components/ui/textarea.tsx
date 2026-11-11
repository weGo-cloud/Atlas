import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full min-w-0 resize-y rounded-md px-3 py-2 border border-border-strong bg-surface text-sm text-foreground placeholder:text-subtle-foreground transition-[border-color,box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };

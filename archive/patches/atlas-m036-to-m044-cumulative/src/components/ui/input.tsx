import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md px-3 py-2 border border-border-strong bg-surface text-sm text-foreground placeholder:text-subtle-foreground transition-[border-color,box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}

export { Input };

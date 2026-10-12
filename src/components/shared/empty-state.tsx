import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One empty-state pattern for every list, table and panel: an icon tile,
 * a headline that says what's missing, a sentence on what to do about it,
 * and an optional action.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "default",
  compact = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "success" | "intelligence";
  /** Tighter padding for use inside an existing card. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface/60 px-6 text-center",
        compact ? "py-8" : "py-14",
        className
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full",
          tone === "success" && "bg-success/10 text-success",
          tone === "intelligence" && "bg-intelligence/10 text-intelligence",
          tone === "default" && "bg-surface-3 text-muted-foreground"
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export { EmptyState };

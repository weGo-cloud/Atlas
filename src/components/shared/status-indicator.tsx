import { cn } from "@/lib/utils";

type StatusTone = "success" | "warning" | "destructive" | "primary" | "intelligence" | "muted";

const DOT_CLASS: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning-fill",
  destructive: "bg-destructive",
  primary: "bg-primary",
  intelligence: "bg-intelligence",
  muted: "bg-subtle-foreground",
};

/**
 * Compact dot + label for connection and health states (channel
 * connected / not connected, model active / not yet available, …).
 * Use Badge for record status; use this for ambient state.
 */
function StatusIndicator({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", DOT_CLASS[tone])} />
      <span className="truncate">{label}</span>
    </span>
  );
}

export { StatusIndicator };
export type { StatusTone };

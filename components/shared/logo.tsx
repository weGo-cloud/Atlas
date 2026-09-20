import { cn } from "@/lib/utils";

function AtlasMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[13px] font-semibold text-primary-foreground",
        className
      )}
    >
      A
    </span>
  );
}

function AtlasLogo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <AtlasMark />
      <span className="text-sm font-semibold tracking-wide text-foreground">
        ATLAS
      </span>
    </span>
  );
}

export { AtlasLogo, AtlasMark };

import { cn } from "@/lib/utils";

/**
 * The Atlas mark: a rounded tile carrying a stylised "A" drawn as a
 * road converging to a point — automotive + navigation in one glyph.
 * Colours come from tokens, so it follows the active theme.
 */
function AtlasMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 19.5 12 4.5l7.5 15" />
        <path d="M8.2 14.5h7.6" opacity="0.75" />
      </svg>
    </span>
  );
}

function AtlasLogo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <AtlasMark />
      <span className="text-[15px] font-semibold tracking-[0.14em] text-foreground">
        ATLAS
      </span>
    </span>
  );
}

export { AtlasLogo, AtlasMark };

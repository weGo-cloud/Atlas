/**
 * Mission 034 — fixed brand colours for exported posts. Deliberately
 * NOT read from app/globals.css's CSS custom properties: satori has no
 * browser/CSSOM, so it can't resolve `var(--primary)`, and an exported
 * image is shared outside the app (no light/dark context to resolve
 * against anyway) — it needs one consistent look. Values are copied
 * from the M032 dark-theme tokens at the time of writing; if the
 * design system's palette changes later, update here too.
 */
export const BRAND = {
  background: "#0f1a2e",
  surface: "#171c27",
  surfaceStrong: "#1e2532",
  foreground: "#ffffff",
  muted: "#9aa4b8",
  primary: "#4f6fff",
  primaryStrong: "#2350e8",
  success: "#3ecf8e",
  warningFill: "#d9910d",
  border: "rgba(255,255,255,0.12)",
} as const;

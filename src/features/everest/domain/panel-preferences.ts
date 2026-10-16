/**
 * How the Everest floating panel looks for one person on one device.
 * Pure and tolerant: whatever is (or isn't) in storage, the result is
 * always a valid set of preferences, so a corrupted value can never
 * break the page.
 */
export type PanelWidth = "compact" | "wide";
export type PanelSide = "right" | "left";

export type PanelPreferences = { open: boolean; width: PanelWidth; side: PanelSide };

export const DEFAULT_PANEL_PREFERENCES: PanelPreferences = { open: false, width: "compact", side: "right" };

/** Panel widths in pixels (the panel is always full-width on a phone). */
export const PANEL_WIDTH_PX: Record<PanelWidth, number> = { compact: 384, wide: 576 };

export const PANEL_STORAGE_KEY = "atlas.everest.panel";

export function parsePanelPreferences(raw: string | null | undefined): PanelPreferences {
  if (!raw) return DEFAULT_PANEL_PREFERENCES;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof PanelPreferences, unknown>> | null;
    if (!value || typeof value !== "object") return DEFAULT_PANEL_PREFERENCES;
    return {
      open: value.open === true,
      width: value.width === "wide" ? "wide" : "compact",
      side: value.side === "left" ? "left" : "right",
    };
  } catch {
    return DEFAULT_PANEL_PREFERENCES;
  }
}

export function serializePanelPreferences(preferences: PanelPreferences): string {
  return JSON.stringify({ open: preferences.open, width: preferences.width, side: preferences.side });
}

/** What Everest says before the first message. It must only promise what is actually built. */
export const EVEREST_GREETING = {
  intro: "I'm Everest. I can look up your stock and prepare changes for you to confirm: add, edit, mark as sold, or delete.",
  outro: "I can also answer questions about running your sales. Nothing changes until you press Confirm.",
  examples: ["What's available under 40,000?", "Mark the grey loveseat as sold", "Lower all sofa prices by 10%"],
} as const;

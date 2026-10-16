import { describe, expect, it } from "vitest";

import {
  DEFAULT_PANEL_PREFERENCES,
  EVEREST_GREETING,
  PANEL_WIDTH_PX,
  parsePanelPreferences,
  serializePanelPreferences,
} from "../panel-preferences";

describe("parsePanelPreferences", () => {
  it("falls back to the closed, compact, right-hand default when nothing is stored", () => {
    expect(parsePanelPreferences(null)).toEqual(DEFAULT_PANEL_PREFERENCES);
    expect(parsePanelPreferences(undefined)).toEqual(DEFAULT_PANEL_PREFERENCES);
    expect(parsePanelPreferences("")).toEqual(DEFAULT_PANEL_PREFERENCES);
    expect(DEFAULT_PANEL_PREFERENCES.open).toBe(false);
  });

  it("never throws on corrupted storage", () => {
    for (const raw of ["not json", "{", "[]", "null", "42", '"text"']) {
      expect(parsePanelPreferences(raw)).toEqual(DEFAULT_PANEL_PREFERENCES);
    }
  });

  it("ignores unknown values field by field instead of rejecting everything", () => {
    expect(parsePanelPreferences(JSON.stringify({ open: "yes", width: "huge", side: "top" }))).toEqual(DEFAULT_PANEL_PREFERENCES);
    expect(parsePanelPreferences(JSON.stringify({ open: true, width: "wide", side: "left" }))).toEqual({ open: true, width: "wide", side: "left" });
    expect(parsePanelPreferences(JSON.stringify({ width: "wide" }))).toEqual({ open: false, width: "wide", side: "right" });
  });

  it("round-trips through serialize", () => {
    const preferences = { open: true, width: "wide", side: "left" } as const;
    expect(parsePanelPreferences(serializePanelPreferences(preferences))).toEqual(preferences);
  });
});

describe("panel sizing and greeting", () => {
  it("wide is wider than compact", () => {
    expect(PANEL_WIDTH_PX.wide).toBeGreaterThan(PANEL_WIDTH_PX.compact);
  });

  it("the greeting promises only what exists: it does not claim tasks or alerts", () => {
    const text = [EVEREST_GREETING.intro, EVEREST_GREETING.outro, ...EVEREST_GREETING.examples].join(" ").toLowerCase();
    expect(text).not.toContain("alert");
    expect(text).not.toContain("task");
    expect(text).toContain("confirm");
  });
});

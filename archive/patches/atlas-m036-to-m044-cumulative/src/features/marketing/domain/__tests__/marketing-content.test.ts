import { describe, expect, it } from "vitest";

import { isContentStale } from "../marketing-content";

describe("isContentStale", () => {
  it("is not stale when sourceUpdatedAt matches the item's current updatedAt", () => {
    const now = "2026-01-01T00:00:00.000Z";
    expect(isContentStale({ sourceUpdatedAt: now }, now)).toBe(false);
  });

  it("is stale when the item's updatedAt has moved on", () => {
    expect(
      isContentStale({ sourceUpdatedAt: "2026-01-01T00:00:00.000Z" }, "2026-01-02T00:00:00.000Z")
    ).toBe(true);
  });

  it("does not mistake different string formats of the same instant for staleness", () => {
    expect(isContentStale({ sourceUpdatedAt: "2026-01-01T00:00:00.000Z" }, "2026-01-01T00:00:00Z")).toBe(false);
  });
});

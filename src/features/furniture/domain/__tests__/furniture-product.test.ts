import { describe, expect, it } from "vitest";

import {
  FURNITURE_CATEGORIES,
  FURNITURE_CONDITIONS,
  FURNITURE_STATUSES,
  canTransitionFurnitureStatus,
  isFurnitureCategory,
  isFurnitureCondition,
  isFurnitureStatus,
} from "../furniture-product";

describe("isFurnitureCategory", () => {
  it("accepts every declared category", () => {
    for (const category of FURNITURE_CATEGORIES) {
      expect(isFurnitureCategory(category)).toBe(true);
    }
  });

  it("rejects an unknown string", () => {
    expect(isFurnitureCategory("spaceships")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isFurnitureCategory(42)).toBe(false);
    expect(isFurnitureCategory(null)).toBe(false);
    expect(isFurnitureCategory(undefined)).toBe(false);
  });
});

describe("isFurnitureCondition", () => {
  it("accepts every declared condition", () => {
    for (const condition of FURNITURE_CONDITIONS) {
      expect(isFurnitureCondition(condition)).toBe(true);
    }
  });

  it("rejects an unknown string", () => {
    expect(isFurnitureCondition("pristine")).toBe(false);
  });
});

describe("isFurnitureStatus", () => {
  it("accepts every declared status", () => {
    for (const status of FURNITURE_STATUSES) {
      expect(isFurnitureStatus(status)).toBe(true);
    }
  });

  it("rejects an unknown string", () => {
    expect(isFurnitureStatus("discontinued")).toBe(false);
  });
});

/** Mission 030, Section 22 — "category handling". Same allowed-transition shape as vehicle-status.ts. */
describe("canTransitionFurnitureStatus", () => {
  it("allows available -> reserved and available -> sold", () => {
    expect(canTransitionFurnitureStatus("available", "reserved")).toBe(true);
    expect(canTransitionFurnitureStatus("available", "sold")).toBe(true);
  });

  it("allows reserved -> available and reserved -> sold", () => {
    expect(canTransitionFurnitureStatus("reserved", "available")).toBe(true);
    expect(canTransitionFurnitureStatus("reserved", "sold")).toBe(true);
  });

  it("allows sold -> available (a returned/relisted item) but not sold -> reserved directly", () => {
    expect(canTransitionFurnitureStatus("sold", "available")).toBe(true);
    expect(canTransitionFurnitureStatus("sold", "reserved")).toBe(false);
  });
});

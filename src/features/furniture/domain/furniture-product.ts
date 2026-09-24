/**
 * Mission 030 — the Wego Furniture vertical's product type. Deliberately
 * its own type, not `Vehicle` with optional fields bolted on (Section
 * 4: "do not force furniture attributes into the Vehicle model") —
 * see schema.ts's `furnitureProducts` table comment for the full
 * reasoning.
 */
export type FurnitureStatus = "available" | "reserved" | "sold";

export const FURNITURE_STATUSES: FurnitureStatus[] = [
  "available",
  "reserved",
  "sold",
];

export const FURNITURE_STATUS_LABEL: Record<FurnitureStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

export type FurnitureCondition = "new" | "used" | "refurbished";

export const FURNITURE_CONDITIONS: FurnitureCondition[] = [
  "new",
  "used",
  "refurbished",
];

export const FURNITURE_CONDITION_LABEL: Record<FurnitureCondition, string> = {
  new: "New",
  used: "Used",
  refurbished: "Refurbished",
};

/**
 * Mission 030, Section 6 — a practical, fixed category list rather
 * than a fully configurable/admin-managed taxonomy: Atlas has no
 * existing "configurable categories" abstraction to reuse (nothing
 * else in the codebase lets a dealer define custom enum values), and
 * building one would be new infrastructure the mission's own scope
 * rule excludes. A closed list, validated server-side exactly like
 * `VehicleStatus`/`FurnitureCondition`, is the smallest option that
 * still gives reliable filtering (Section 12).
 */
export const FURNITURE_CATEGORIES = [
  "sofas",
  "beds",
  "dining_tables",
  "dining_chairs",
  "office_furniture",
  "wardrobes",
  "tv_stands",
  "coffee_tables",
  "outdoor_furniture",
  "mattresses",
  "other",
] as const;

export type FurnitureCategory = (typeof FURNITURE_CATEGORIES)[number];

export const FURNITURE_CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  sofas: "Sofas",
  beds: "Beds",
  dining_tables: "Dining Tables",
  dining_chairs: "Dining Chairs",
  office_furniture: "Office Furniture",
  wardrobes: "Wardrobes",
  tv_stands: "TV Stands",
  coffee_tables: "Coffee Tables",
  outdoor_furniture: "Outdoor Furniture",
  mattresses: "Mattresses",
  other: "Other",
};

export function isFurnitureCategory(value: unknown): value is FurnitureCategory {
  return typeof value === "string" && (FURNITURE_CATEGORIES as readonly string[]).includes(value);
}

export function isFurnitureCondition(value: unknown): value is FurnitureCondition {
  return typeof value === "string" && (FURNITURE_CONDITIONS as readonly string[]).includes(value);
}

export function isFurnitureStatus(value: unknown): value is FurnitureStatus {
  return typeof value === "string" && (FURNITURE_STATUSES as readonly string[]).includes(value);
}

export type FurnitureProduct = {
  id: string;
  businessId: string;
  name: string;
  description: string;
  category: FurnitureCategory;
  price: number;
  currency: string;
  condition: FurnitureCondition;
  status: FurnitureStatus;
  material: string | null;
  color: string | null;
  dimensions: string | null;
  sku: string | null;
  addedAt: string;
  updatedAt: string;
};

/**
 * Same allowed-transition shape as vehicle-status.ts's
 * ALLOWED_STATUS_TRANSITIONS — sold can only return to available,
 * never re-reserved directly.
 */
export const ALLOWED_FURNITURE_STATUS_TRANSITIONS: Record<FurnitureStatus, FurnitureStatus[]> = {
  available: ["reserved", "sold"],
  reserved: ["available", "sold"],
  sold: ["available"],
};

export function canTransitionFurnitureStatus(from: FurnitureStatus, to: FurnitureStatus): boolean {
  return ALLOWED_FURNITURE_STATUS_TRANSITIONS[from].includes(to);
}

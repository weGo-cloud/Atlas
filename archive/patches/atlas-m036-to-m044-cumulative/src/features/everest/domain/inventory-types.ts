/**
 * Mission 036 — the vertical-agnostic vocabulary the assistant's tools
 * speak. Each vertical (Auto vehicles, Furniture products) implements
 * `InventoryAdapter` over its own *existing* service, so Everest never
 * touches a table and one tool set works for both.
 */

export type InventoryStatus = "available" | "reserved" | "sold";
export const INVENTORY_STATUSES: readonly InventoryStatus[] = ["available", "reserved", "sold"];

export type InventoryVertical = "auto" | "furniture";

/** One stock item, flattened to display strings/numbers. `fields` holds every editable attribute by its tool field name. */
export type InventoryItem = {
  id: string;
  /** Short human label, e.g. "2018 Toyota Prado" or "Kilimani 2-Seater Loveseat". */
  label: string;
  status: InventoryStatus;
  price: number;
  fields: Record<string, string | number | null>;
};

export type FieldSpec = {
  /** The name the model uses (and the key in `InventoryItem.fields`). */
  name: string;
  type: "string" | "integer";
  description: string;
  /** Present for enum-like fields. */
  enum?: readonly string[];
  /** Whether create_item must receive it (the vertical's validators still have the final say). */
  requiredOnCreate: boolean;
  /** Whether a bulk update may set it (unique or per-item-identifying fields cannot be). */
  bulkEditable: boolean;
  /** Display label on confirmation cards. */
  label: string;
  /** Format a value for display on a card. */
  money?: boolean;
};

export type InventoryError = { code: string; message: string; fieldErrors?: Record<string, string> };
export type InventoryResult<T> = { ok: true; data: T } | { ok: false; error: InventoryError };

export type SearchFilters = {
  query?: string;
  status?: InventoryStatus;
  /** Category (furniture) or make (auto). */
  group?: string;
  minPrice?: number;
  maxPrice?: number;
  limit: number;
};

export interface InventoryAdapter {
  readonly vertical: InventoryVertical;
  /** "vehicle" / "furniture product" — used in copy. */
  readonly itemNoun: string;
  readonly itemNounPlural: string;
  /** What `group` means for this vertical: "category" or "make". */
  readonly groupLabel: string;
  /** The entitlement limit key for creating items of this vertical. */
  readonly limitKey: "vehicles" | "furniture_products";
  /** The permission needed to delete items of this vertical. */
  readonly deletePermission: "vehicle.delete" | "furniture_product.delete";
  readonly fields: readonly FieldSpec[];

  search(filters: SearchFilters): Promise<{ items: InventoryItem[]; total: number }>;
  getMany(ids: string[]): Promise<InventoryItem[]>;
  countByStatus(): Promise<Record<InventoryStatus, number>>;
  listGroups(): Promise<string[]>;

  /** Whether the vertical's status rules allow moving an item from one status to another. */
  canTransition(from: InventoryStatus, to: InventoryStatus): boolean;

  /** Short human label for an item described by `fields` (before it exists), used on cards. */
  labelFor(fields: Record<string, string | number | null>): string;

  /** Validates `fields` as a create input *without* writing; returns per-field errors, or the normalized fields. */
  validateCreate(fields: Record<string, unknown>): { ok: true; fields: Record<string, string | number | null> } | { ok: false; errors: Record<string, string> };
  /** Validates a partial update *without* writing. */
  validateUpdate(fields: Record<string, unknown>): { ok: true; fields: Record<string, string | number | null> } | { ok: false; errors: Record<string, string> };

  create(fields: Record<string, string | number | null>, limit: number | null): Promise<InventoryResult<InventoryItem>>;
  update(id: string, fields: Record<string, string | number | null>): Promise<InventoryResult<InventoryItem>>;
  setStatus(id: string, status: InventoryStatus): Promise<InventoryResult<InventoryItem>>;
  delete(id: string): Promise<InventoryResult<{ mediaCleanupFailures: number }>>;
}

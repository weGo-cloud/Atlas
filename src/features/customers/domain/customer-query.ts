import {
  normalizePagination,
  type PaginatedResult,
} from "@/features/inventory/domain/vehicle-query";

// Re-exported so callers of this module don't also need to reach
// into the inventory feature directly for pagination primitives.
export { normalizePagination };
export type { PaginatedResult };

export type CustomerQuery = {
  /** Matched against name, phone, and email. */
  search?: string;
  page?: number;
  pageSize?: number;
};

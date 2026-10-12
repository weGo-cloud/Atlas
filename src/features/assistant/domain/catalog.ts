import type { ItemFacts } from "./types";

export type SearchFilters = {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  color?: string;
  material?: string;
  condition?: string;
  keywords?: string;
  sort?: "relevance" | "price-asc" | "price-desc";
  limit?: number;
};

export type SearchOutcome = {
  /** Items satisfying every filter given. */
  exact: ItemFacts[];
  /** Only populated when `exact` is empty: the nearest items after relaxing constraints in a fixed order. */
  alternatives: ItemFacts[];
  /** Which constraints were dropped/widened to find `alternatives`, in the order they were relaxed. */
  relaxed: string[];
};

export type CategorySummary = { category: string; label: string; count: number };

/**
 * The vertical-specific seam of the assistant (mirrors conversion's
 * CatalogAdapter). The engine only ever talks to this interface, so a
 * second vertical means one new implementation, not engine changes.
 */
export interface AssistantCatalog {
  readonly itemNounSingular: string;
  readonly itemNounPlural: string;
  search(filters: SearchFilters): Promise<SearchOutcome>;
  /** Any status — the assistant must be able to say an item is reserved or sold rather than pretend it doesn't exist. */
  getItem(id: string): Promise<ItemFacts | null>;
  listCategories(): Promise<CategorySummary[]>;
}

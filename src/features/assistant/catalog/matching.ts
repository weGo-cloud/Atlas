import type { SearchFilters, SearchOutcome } from "../domain/catalog";
import type { ItemFacts } from "../domain/types";

/**
 * Mission 033 — the pure filtering/relaxation logic behind
 * `search_inventory`. Kept free of any database or vertical knowledge so
 * it can be tested exhaustively: given a list of *available* items and
 * the customer's filters, it returns exact matches, or — only when
 * there are none — the nearest alternatives plus an explicit list of
 * which constraints had to be relaxed to find them. That list is what
 * lets the assistant say "nothing in leather under 60k; here are fabric
 * options" truthfully instead of blurring an approximate match into an
 * exact one.
 */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "have", "has", "want", "need", "looking", "some", "something",
  "small", "big", "large", "nice", "good", "cheap", "please", "any", "your", "you", "are", "can", "get", "one",
  "kwa", "na", "ya", "wa", "za", "ni", "yangu", "nataka", "ninataka",
]);

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bgray\b/g, "grey")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function haystack(item: ItemFacts): string {
  return normalizeText(
    [item.name, item.description, item.material ?? "", item.color ?? "", item.dimensions ?? "", item.categoryLabel].join(" ")
  );
}

function matchesColor(item: ItemFacts, color: string): boolean {
  const wanted = tokens(color);
  if (wanted.length === 0) return true;
  const target = normalizeText(`${item.color ?? ""} ${item.name}`);
  return wanted.some((token) => target.includes(token));
}

function matchesMaterial(item: ItemFacts, material: string): boolean {
  const wanted = tokens(material);
  if (wanted.length === 0) return true;
  const target = normalizeText(`${item.material ?? ""} ${item.name} ${item.description}`);
  return wanted.some((token) => target.includes(token));
}

function keywordScore(item: ItemFacts, keywords: string): number {
  const wanted = tokens(keywords);
  if (wanted.length === 0) return 0;
  const target = haystack(item);
  return wanted.filter((token) => target.includes(token)).length;
}

type Constraint = Pick<SearchFilters, "category" | "minPrice" | "maxPrice" | "color" | "material" | "condition" | "keywords">;

function hasKeywordTokens(keywords: string | undefined): boolean {
  return Boolean(keywords && tokens(keywords).length > 0);
}

function filterItems(items: ItemFacts[], c: Constraint): Array<{ item: ItemFacts; score: number }> {
  const result: Array<{ item: ItemFacts; score: number }> = [];
  for (const item of items) {
    if (c.category && item.category !== c.category) continue;
    if (c.condition && item.condition !== c.condition) continue;
    if (c.minPrice !== undefined && item.price < c.minPrice) continue;
    if (c.maxPrice !== undefined && item.price > c.maxPrice) continue;
    if (c.color && !matchesColor(item, c.color)) continue;
    if (c.material && !matchesMaterial(item, c.material)) continue;
    let score = 0;
    if (hasKeywordTokens(c.keywords)) {
      score = keywordScore(item, c.keywords!);
      if (score === 0) continue;
    }
    result.push({ item, score });
  }
  return result;
}

function rank(matches: Array<{ item: ItemFacts; score: number }>, sort: SearchFilters["sort"], limit: number): ItemFacts[] {
  const sorted = [...matches].sort((a, b) => {
    if (sort === "price-asc") return a.item.price - b.item.price;
    if (sort === "price-desc") return b.item.price - a.item.price;
    return b.score - a.score || a.item.price - b.item.price;
  });
  return sorted.slice(0, limit).map((entry) => entry.item);
}

function constraintCount(c: Constraint): number {
  return [
    c.category,
    c.condition,
    c.color,
    c.material,
    c.minPrice !== undefined || c.maxPrice !== undefined ? "price" : undefined,
    hasKeywordTokens(c.keywords) ? c.keywords : undefined,
  ].filter(Boolean).length;
}

const MAX_LIMIT = 5;

export function runSearch(available: ItemFacts[], filters: SearchFilters): SearchOutcome {
  const limit = Math.min(Math.max(filters.limit ?? 3, 1), MAX_LIMIT);
  const base: Constraint = {
    category: filters.category,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    color: filters.color,
    material: filters.material,
    condition: filters.condition,
    keywords: filters.keywords,
  };

  const exact = filterItems(available, base);
  if (exact.length > 0) {
    return { exact: rank(exact, filters.sort, limit), alternatives: [], relaxed: [] };
  }

  // Nothing matches exactly: relax one constraint at a time, cumulatively, in a fixed order,
  // and record precisely what was relaxed. A step only counts if some real constraint remains,
  // so "relaxing" can never degrade into "show me everything".
  const steps: Array<{ label: string; apply: (c: Constraint) => Constraint; applies: (c: Constraint) => boolean }> = [
    { label: "keywords", applies: (c) => hasKeywordTokens(c.keywords), apply: (c) => ({ ...c, keywords: undefined }) },
    { label: "colour", applies: (c) => Boolean(c.color), apply: (c) => ({ ...c, color: undefined }) },
    { label: "material", applies: (c) => Boolean(c.material), apply: (c) => ({ ...c, material: undefined }) },
    {
      label: "budget (widened by up to 25%)",
      applies: (c) => c.minPrice !== undefined || c.maxPrice !== undefined,
      apply: (c) => ({
        ...c,
        minPrice: c.minPrice !== undefined ? Math.floor(c.minPrice * 0.75) : undefined,
        maxPrice: c.maxPrice !== undefined ? Math.ceil(c.maxPrice * 1.25) : undefined,
      }),
    },
    { label: "condition", applies: (c) => Boolean(c.condition), apply: (c) => ({ ...c, condition: undefined }) },
  ];

  let current = base;
  const relaxed: string[] = [];
  for (const step of steps) {
    if (!step.applies(current)) continue;
    const next = step.apply(current);
    if (constraintCount(next) === 0) break;
    current = next;
    relaxed.push(step.label);
    const matches = filterItems(available, current);
    if (matches.length > 0) {
      return { exact: [], alternatives: rank(matches, filters.sort, limit), relaxed };
    }
  }
  return { exact: [], alternatives: [], relaxed: [] };
}

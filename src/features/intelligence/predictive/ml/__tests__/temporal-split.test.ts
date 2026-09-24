import { describe, expect, it } from "vitest";

import { splitTemporal } from "../temporal-split";

type Item = { id: string; t: string };

describe("splitTemporal", () => {
  const items: Item[] = Array.from({ length: 10 }, (_, i) => ({ id: `item_${i}`, t: `2026-01-${String(i + 1).padStart(2, "0")}` }));

  it("splits chronologically — earliest to train, latest to test", () => {
    const result = splitTemporal(items, (i) => i.t, { train: 0.6, validation: 0.2, test: 0.2 });
    expect(result.train.map((i) => i.id)).toEqual(["item_0", "item_1", "item_2", "item_3", "item_4", "item_5"]);
    expect(result.validation.map((i) => i.id)).toEqual(["item_6", "item_7"]);
    expect(result.test.map((i) => i.id)).toEqual(["item_8", "item_9"]);
  });

  it("every item appears in exactly one split", () => {
    const result = splitTemporal(items, (i) => i.t);
    const all = [...result.train, ...result.validation, ...result.test];
    expect(all).toHaveLength(items.length);
    expect(new Set(all.map((i) => i.id)).size).toBe(items.length);
  });

  it("throws when input is not sorted oldest-first", () => {
    const shuffled = [items[1], items[0], ...items.slice(2)];
    expect(() => splitTemporal(shuffled, (i) => i.t)).toThrow();
  });

  it("handles an empty input without throwing", () => {
    const result = splitTemporal([], (i: Item) => i.t);
    expect(result).toEqual({ train: [], validation: [], test: [] });
  });
});

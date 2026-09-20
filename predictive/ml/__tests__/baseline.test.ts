import { describe, expect, it } from "vitest";

import { trainBaseline, predictBaseline } from "../baseline";

describe("trainBaseline / predictBaseline", () => {
  it("computes the overall positive rate", () => {
    const model = trainBaseline([1, 1, 0, 0, 0]);
    expect(model.positiveRate).toBeCloseTo(0.4);
  });

  it("predicts the same value regardless of input (no features used)", () => {
    const model = trainBaseline([1, 0, 1, 0]);
    expect(predictBaseline(model)).toBe(0.5);
  });

  it("throws on an empty label set rather than returning NaN", () => {
    expect(() => trainBaseline([])).toThrow();
  });
});

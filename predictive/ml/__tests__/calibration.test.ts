import { describe, expect, it } from "vitest";

import { calibrationCurve } from "../calibration";
import type { ScoredExample } from "../evaluation";

describe("calibrationCurve", () => {
  it("bins examples by predicted score into the correct bin", () => {
    const examples: ScoredExample[] = [
      { score: 0.05, label: 0 },
      { score: 0.15, label: 1 },
      { score: 0.95, label: 1 },
    ];
    const bins = calibrationCurve(examples, 10);
    expect(bins).toHaveLength(10);
    expect(bins[0].count).toBe(1); // [0, 0.1)
    expect(bins[1].count).toBe(1); // [0.1, 0.2)
    expect(bins[9].count).toBe(1); // [0.9, 1.0]
  });

  it("reports null (not 0) for empty bins", () => {
    const bins = calibrationCurve([{ score: 0.95, label: 1 }], 10);
    expect(bins[0].meanPredicted).toBeNull();
    expect(bins[0].observedRate).toBeNull();
  });

  it("computes correct mean-predicted and observed-rate for a populated bin", () => {
    const examples: ScoredExample[] = [
      { score: 0.72, label: 1 },
      { score: 0.78, label: 0 },
    ];
    const bins = calibrationCurve(examples, 10);
    const bin = bins[7]; // [0.7, 0.8)
    expect(bin.count).toBe(2);
    expect(bin.meanPredicted).toBeCloseTo(0.75);
    expect(bin.observedRate).toBeCloseTo(0.5);
  });

  it("includes the top edge (1.0) in the final bin", () => {
    const bins = calibrationCurve([{ score: 1, label: 1 }], 10);
    expect(bins[9].count).toBe(1);
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit, resetRateLimitsForTests } from "../rate-limit";

beforeEach(() => resetRateLimitsForTests());

describe("checkRateLimit", () => {
  it("allows requests within the limit and blocks the one that exceeds it", () => {
    const key = "ip:1.2.3.4";
    for (let i = 0; i < 5; i += 1) expect(checkRateLimit(key, 5, 60_000, 1000).allowed).toBe(true);
    const blocked = checkRateLimit(key, 5, 60_000, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets the window after it elapses", () => {
    const key = "ip:5.5.5.5";
    for (let i = 0; i < 3; i += 1) checkRateLimit(key, 3, 1000, 0);
    expect(checkRateLimit(key, 3, 1000, 0).allowed).toBe(false);
    expect(checkRateLimit(key, 3, 1000, 1001).allowed).toBe(true);
  });

  it("tracks separate keys independently", () => {
    expect(checkRateLimit("a", 1, 1000, 0).allowed).toBe(true);
    expect(checkRateLimit("a", 1, 1000, 0).allowed).toBe(false);
    expect(checkRateLimit("b", 1, 1000, 0).allowed).toBe(true);
  });
});

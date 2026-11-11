import { describe, expect, it } from "vitest";

import { MAX_ALLOWED_ORIGINS, normalizeAllowedOrigins } from "../api-origins";

describe("normalizeAllowedOrigins", () => {
  it("normalizes, trims, dedupes and ignores blanks", () => {
    const result = normalizeAllowedOrigins([" https://Shop.co.ke/ ", "https://shop.co.ke", "", "https://other.com:8443"]);
    expect(result).toEqual({ ok: true, origins: ["https://shop.co.ke", "https://other.com:8443"] });
  });
  it("allows http only for localhost", () => {
    expect(normalizeAllowedOrigins(["http://localhost:3000"]).ok).toBe(true);
    expect(normalizeAllowedOrigins(["http://shop.co.ke"]).ok).toBe(false);
  });
  it("rejects paths, queries, credentials, junk and wildcards", () => {
    for (const bad of ["https://shop.co.ke/app", "https://shop.co.ke?x=1", "https://u:p@shop.co.ke", "not a url", "*", "https://*.shop.co.ke", "javascript:alert(1)"]) {
      expect(normalizeAllowedOrigins([bad]).ok, bad).toBe(false);
    }
  });
  it("caps the list size", () => {
    const many = Array.from({ length: MAX_ALLOWED_ORIGINS + 1 }, (_, i) => `https://s${i}.example.com`);
    expect(normalizeAllowedOrigins(many).ok).toBe(false);
  });
  it("empty input clears the restriction", () => {
    expect(normalizeAllowedOrigins([])).toEqual({ ok: true, origins: [] });
  });
});

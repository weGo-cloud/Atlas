import { describe, expect, it } from "vitest";

import { SUBSCRIPTION_STATUSES } from "../subscription";
import { accessLevelForStatus, accessLevelMessage } from "../access-policy";

describe("accessLevelForStatus", () => {
  it("trialing and active are 'full'", () => {
    expect(accessLevelForStatus("trialing")).toBe("full");
    expect(accessLevelForStatus("active")).toBe("full");
  });

  it("past_due is 'grace'", () => {
    expect(accessLevelForStatus("past_due")).toBe("grace");
  });

  it("paused, cancelled, and expired are 'locked'", () => {
    expect(accessLevelForStatus("paused")).toBe("locked");
    expect(accessLevelForStatus("cancelled")).toBe("locked");
    expect(accessLevelForStatus("expired")).toBe("locked");
  });

  it("covers every declared status with no throw", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(() => accessLevelForStatus(status)).not.toThrow();
    }
  });
});

describe("accessLevelMessage", () => {
  it("has no message for 'full' (nothing to warn about)", () => {
    expect(accessLevelMessage("full")).toBeNull();
  });

  it("warns without alarming for 'grace'", () => {
    expect(accessLevelMessage("grace")).toContain("payment");
  });

  it("reassures that data is safe for 'locked'", () => {
    const message = accessLevelMessage("locked");
    expect(message).toContain("safe");
  });
});

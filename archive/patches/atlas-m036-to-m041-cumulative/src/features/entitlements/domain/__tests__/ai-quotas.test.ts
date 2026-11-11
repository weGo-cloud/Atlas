import { describe, expect, it } from "vitest";

import {
  ASSISTANT_DAILY_LIMIT_GROWTH,
  ASSISTANT_DAILY_LIMIT_PRO,
  EVEREST_MONTHLY_MESSAGE_LIMIT,
  TRIAL_LIMITS,
  effectiveLimitFor,
  hasCapability,
} from "../plan";

describe("Mission 038 — plan-based AI allowances", () => {
  it("the free Starter plan has no customer assistant (no AI cost)", () => {
    expect(hasCapability("starter", "assistant")).toBe(false);
  });

  it("Growth and Pro include the assistant with the configured daily allowance", () => {
    expect(hasCapability("growth", "assistant")).toBe(true);
    expect(hasCapability("pro", "assistant")).toBe(true);
    expect(effectiveLimitFor("growth", "active", "assistant_messages_daily")).toBe(ASSISTANT_DAILY_LIMIT_GROWTH);
    expect(effectiveLimitFor("pro", "active", "assistant_messages_daily")).toBe(ASSISTANT_DAILY_LIMIT_PRO);
  });

  it("a trial on the Pro plan gets the tighter trial allowances, a paid Pro does not", () => {
    expect(effectiveLimitFor("pro", "trialing", "assistant_messages_daily")).toBe(TRIAL_LIMITS.assistant_messages_daily);
    expect(effectiveLimitFor("pro", "trialing", "everest_messages")).toBe(TRIAL_LIMITS.everest_messages);
    expect(effectiveLimitFor("pro", "active", "everest_messages")).toBe(EVEREST_MONTHLY_MESSAGE_LIMIT);
  });

  it("trial limits only ever lower a plan limit and never grant one the plan lacks the cap for incorrectly", () => {
    expect(effectiveLimitFor("pro", "trialing", "assistant_messages_daily")!).toBeLessThanOrEqual(ASSISTANT_DAILY_LIMIT_PRO);
    // item limits are untouched by the trial table
    expect(effectiveLimitFor("pro", "trialing", "vehicles")).toBeNull();
    expect(effectiveLimitFor("starter", "active", "vehicles")).toBe(30);
  });
});

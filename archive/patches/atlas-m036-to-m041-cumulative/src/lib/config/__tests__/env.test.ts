import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { configStatus, validateProductionEnv } from "../env";

const good = {
  DATABASE_URL: "file:/data/atlas.db",
  ALLOWED_ORIGINS: "atlas.example.com",
  PUBLIC_BASE_URL: "https://atlas.example.com",
  ATLAS_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};

describe("validateProductionEnv", () => {
  it("accepts a complete configuration", () => {
    expect(validateProductionEnv(good)).toEqual([]);
  });
  it("reports every missing required variable by name", () => {
    const names = validateProductionEnv({}).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(["DATABASE_URL", "ALLOWED_ORIGINS", "PUBLIC_BASE_URL", "ATLAS_ENCRYPTION_KEY"]));
  });
  it("rejects a non-https base URL and a wrong-length encryption key", () => {
    const issues = validateProductionEnv({ ...good, PUBLIC_BASE_URL: "http://atlas.example.com", ATLAS_ENCRYPTION_KEY: "c2hvcnQ=" });
    expect(issues.map((i) => i.name).sort()).toEqual(["ATLAS_ENCRYPTION_KEY", "PUBLIC_BASE_URL"]);
  });
  it("flags secrets exposed through NEXT_PUBLIC_ variables", () => {
    const issues = validateProductionEnv({ ...good, NEXT_PUBLIC_ANTHROPIC_API_KEY: "x" });
    expect(issues.some((i) => i.name === "NEXT_PUBLIC_ANTHROPIC_API_KEY")).toBe(true);
  });
  it("never echoes values", () => {
    const secret = "s3cr3t-value-should-not-leak";
    const text = JSON.stringify(validateProductionEnv({ ...good, ATLAS_ENCRYPTION_KEY: secret }));
    expect(text).not.toContain(secret);
  });
});

describe("plan billing config is all-or-nothing (Mission 041)", () => {
  const billing = { MPESA_PLATFORM_ENV: "sandbox", MPESA_PLATFORM_SHORTCODE: "174379", MPESA_PLATFORM_CONSUMER_KEY: "k".repeat(24), MPESA_PLATFORM_CONSUMER_SECRET: "s".repeat(24), MPESA_PLATFORM_PASSKEY: "p".repeat(64), BILLING_CALLBACK_TOKEN: "a".repeat(48), BILLING_CRON_SECRET: "c".repeat(40) };
  it("no billing variables is fine; a complete set is fine", () => {
    expect(validateProductionEnv(good)).toEqual([]);
    expect(validateProductionEnv({ ...good, ...billing })).toEqual([]);
  });
  it("a partial set stops the boot and names what's missing", () => {
    const names = validateProductionEnv({ ...good, MPESA_PLATFORM_CONSUMER_KEY: "x".repeat(24) }).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(["BILLING_CALLBACK_TOKEN", "BILLING_CRON_SECRET", "MPESA_PLATFORM_PASSKEY"]));
  });
  it("rejects a weak cron secret, a malformed callback token and an unknown environment", () => {
    const names = validateProductionEnv({ ...good, ...billing, BILLING_CRON_SECRET: "short", BILLING_CALLBACK_TOKEN: "nothex", MPESA_PLATFORM_ENV: "staging" }).map((i) => i.name);
    expect(names.sort()).toEqual(["BILLING_CALLBACK_TOKEN", "BILLING_CRON_SECRET", "MPESA_PLATFORM_ENV"]);
  });
});

describe("configStatus", () => {
  it("returns booleans only", () => {
    const status = configStatus({ ANTHROPIC_API_KEY: "sk-ant-secret" });
    expect(status).toEqual({ ai: true, whatsapp: false, encryption: false, billing: false });
    expect(JSON.stringify(status)).not.toContain("sk-ant");
  });
});

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { MetaChannelProvider as MetaProviderClass } from "../meta-channel-provider";
import type { WhatsAppChannelProvider as WhatsAppProviderClass } from "../whatsapp-channel-provider";

// These providers transitively import the Drizzle db client at module
// load time, which throws immediately if DATABASE_URL is unset.
// Static imports are hoisted ahead of any other top-level statement,
// so the env var has to be set before a dynamic import, in beforeAll
// — not just textually before a static `import` line.
let MetaChannelProvider: typeof MetaProviderClass;
let WhatsAppChannelProvider: typeof WhatsAppProviderClass;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "file::memory:";
  MetaChannelProvider = (await import("../meta-channel-provider")).MetaChannelProvider;
  WhatsAppChannelProvider = (await import("../whatsapp-channel-provider")).WhatsAppChannelProvider;
});

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("MetaChannelProvider.isPlatformConfigured (Mission 031, Section 15 — never claim 'connected' falsely)", () => {
  beforeEach(() => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });

  it("is false when META_APP_ID/META_APP_SECRET are unset", () => {
    expect(new MetaChannelProvider().isPlatformConfigured()).toBe(false);
  });

  it("is false when only one of the two is set", () => {
    process.env.META_APP_ID = "app-id";
    expect(new MetaChannelProvider().isPlatformConfigured()).toBe(false);
  });

  it("is true when both are set", () => {
    process.env.META_APP_ID = "app-id";
    process.env.META_APP_SECRET = "app-secret";
    expect(new MetaChannelProvider().isPlatformConfigured()).toBe(true);
  });
});

describe("MetaChannelProvider.resolveStatus", () => {
  it("resolves to 'configuration_error' when the platform isn't configured, regardless of any business row", async () => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    const status = await new MetaChannelProvider().resolveStatus("any-business-id");
    expect(status).toBe("configuration_error");
  });
});

describe("WhatsAppChannelProvider.isPlatformConfigured", () => {
  it("is false when credentials are unset", () => {
    delete process.env.META_APP_ID;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect(new WhatsAppChannelProvider().isPlatformConfigured()).toBe(false);
  });

  it("is true when both required env vars are set", () => {
    process.env.META_APP_ID = "app-id";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
    expect(new WhatsAppChannelProvider().isPlatformConfigured()).toBe(true);
  });
});

describe("publish() fails honestly when unconfigured, rather than pretending to send", () => {
  it("MetaChannelProvider.publish throws CONFIGURATION_ERROR", async () => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    await expect(new MetaChannelProvider().publish("biz_1", "hello")).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
  });

  it("WhatsAppChannelProvider.publish throws CONFIGURATION_ERROR", async () => {
    delete process.env.META_APP_ID;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await expect(new WhatsAppChannelProvider().publish("biz_1", "hello", { recipientPhone: "254700000000" })).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
    });
  });

  it("WhatsAppChannelProvider.publish requires a recipientPhone even if otherwise configured", async () => {
    process.env.META_APP_ID = "app-id";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
    await expect(new WhatsAppChannelProvider().publish("biz_1", "hello")).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});

import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PublishService as ServiceClass } from "../publish-service";
import type { DatabaseMarketingContentRepository as ContentRepoClass } from "../../repository/database-marketing-content-repository";
import type {
  DatabaseMarketingChannelRepository as ChannelRepoClass,
  DatabaseMarketingPublicationRepository as PublicationRepoClass,
} from "../../repository/database-marketing-channel-repository";
import type { ChannelProvider } from "../../channels/channel-provider";
import { ChannelPublishError } from "../../channels/channel-provider";
import type { ConnectionStatus, MarketingChannel } from "../../domain/marketing-channel";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-publish-service-db-"));
const testDbPath = path.join(testDir, "test.db");

let PublishService: typeof ServiceClass;
let DatabaseMarketingContentRepository: typeof ContentRepoClass;
let DatabaseMarketingChannelRepository: typeof ChannelRepoClass;
let DatabaseMarketingPublicationRepository: typeof PublicationRepoClass;
let rawDb: Database.Database;

const STARTER_BUSINESS = "biz_publish_starter"; // no marketing_automation capability
const GROWTH_BUSINESS = "biz_publish_growth"; // has marketing_automation capability

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  const now = new Date().toISOString();
  for (const [id, plan] of [
    [STARTER_BUSINESS, "starter"],
    [GROWTH_BUSINESS, "growth"],
  ] as const) {
    setupDb
      .prepare("INSERT INTO businesses (id, name, vertical, created_at, updated_at) VALUES (?, ?, 'auto', ?, ?)")
      .run(id, `Business ${id}`, now, now);
    setupDb
      .prepare("INSERT INTO subscriptions (id, business_id, plan, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)")
      .run(`sub_${id}`, id, plan, now, now);
  }
  setupDb.close();

  PublishService = (await import("../publish-service")).PublishService;
  DatabaseMarketingContentRepository = (await import("../../repository/database-marketing-content-repository"))
    .DatabaseMarketingContentRepository;
  const channelModule = await import("../../repository/database-marketing-channel-repository");
  DatabaseMarketingChannelRepository = channelModule.DatabaseMarketingChannelRepository;
  DatabaseMarketingPublicationRepository = channelModule.DatabaseMarketingPublicationRepository;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

beforeEach(() => {
  rawDb.exec("DELETE FROM marketing_publications; DELETE FROM marketing_content; DELETE FROM marketing_channel_connections;");
});

function seedContent(businessId: string): string {
  const id = `mkt_test_${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO marketing_content (id, business_id, item_type, item_id, generation_method, social_caption, whatsapp_message, grounded_facts_json, source_updated_at, created_at, updated_at)
       VALUES (?, ?, 'vehicle', 'veh_x', 'template', 'caption', 'message', '{}', ?, ?, ?)`
    )
    .run(id, businessId, now, now, now);
  return id;
}

/** A provider stub — never a real network call. */
function stubProvider(channel: MarketingChannel, behavior: "succeed" | "not_connected" | "provider_error"): ChannelProvider {
  return {
    channel,
    isPlatformConfigured: () => true,
    resolveStatus: async () => "connected" as ConnectionStatus,
    publish: async () => {
      if (behavior === "succeed") return { externalId: "ext_123" };
      if (behavior === "not_connected") throw new ChannelPublishError("Not connected.", "NOT_CONNECTED");
      throw new ChannelPublishError("Provider rejected the request.", "PROVIDER_ERROR");
    },
  };
}

function getService(businessId: string, providers: Partial<Record<MarketingChannel, ChannelProvider>>) {
  return new PublishService(
    businessId,
    new DatabaseMarketingContentRepository(businessId),
    new DatabaseMarketingPublicationRepository(businessId),
    providers as Record<MarketingChannel, ChannelProvider>
  );
}

describe("Entitlement gating (Mission 031, Section 22)", () => {
  it("rejects publish for a business without marketing_automation (starter plan)", async () => {
    const contentId = seedContent(STARTER_BUSINESS);
    const service = getService(STARTER_BUSINESS, { meta: stubProvider("meta", "succeed") });
    const result = await service.publish(contentId, "meta");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
  });

  it("rejects simulatePublish for a business without marketing_automation too — the demo path is still gated", async () => {
    const contentId = seedContent(STARTER_BUSINESS);
    const service = getService(STARTER_BUSINESS, { meta: stubProvider("meta", "succeed") });
    const result = await service.simulatePublish(contentId, "meta");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
  });

  it("allows publish for a business with marketing_automation (growth plan)", async () => {
    const contentId = seedContent(GROWTH_BUSINESS);
    const service = getService(GROWTH_BUSINESS, { meta: stubProvider("meta", "succeed") });
    const result = await service.publish(contentId, "meta");
    expect(result.ok).toBe(true);
  });
});

describe("simulatePublish (Mission 031, Section 17)", () => {
  it("always records isSimulated: true and status 'simulated'", async () => {
    const contentId = seedContent(GROWTH_BUSINESS);
    const service = getService(GROWTH_BUSINESS, { whatsapp: stubProvider("whatsapp", "succeed") });
    const result = await service.simulatePublish(contentId, "whatsapp");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isSimulated).toBe(true);
    expect(result.data.status).toBe("simulated");
    expect(result.data.externalId).toBeNull();
  });

  it("never calls the real provider", async () => {
    const contentId = seedContent(GROWTH_BUSINESS);
    let providerCalled = false;
    const provider: ChannelProvider = {
      channel: "meta",
      isPlatformConfigured: () => true,
      resolveStatus: async () => "connected",
      publish: async () => {
        providerCalled = true;
        return { externalId: "should-not-happen" };
      },
    };
    const service = getService(GROWTH_BUSINESS, { meta: provider });
    await service.simulatePublish(contentId, "meta");
    expect(providerCalled).toBe(false);
  });
});

describe("publish — real path failure handling (Mission 031, Section 16)", () => {
  it("records a 'failed' publication (isSimulated: false) when the provider is not connected", async () => {
    const contentId = seedContent(GROWTH_BUSINESS);
    const service = getService(GROWTH_BUSINESS, { meta: stubProvider("meta", "not_connected") });
    const result = await service.publish(contentId, "meta");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PUBLISH_FAILED");

    const rows = rawDb.prepare("SELECT * FROM marketing_publications WHERE marketing_content_id = ?").all(contentId) as Array<{
      status: string;
      is_simulated: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].is_simulated).toBe(0);
  });

  it("never silently marks a failed publish as successful", async () => {
    const contentId = seedContent(GROWTH_BUSINESS);
    const service = getService(GROWTH_BUSINESS, { meta: stubProvider("meta", "provider_error") });
    const result = await service.publish(contentId, "meta");
    expect(result.ok).toBe(false);
  });

  it("fails with CONTENT_NOT_FOUND for a nonexistent content id", async () => {
    const service = getService(GROWTH_BUSINESS, { meta: stubProvider("meta", "succeed") });
    const result = await service.publish("does-not-exist", "meta");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONTENT_NOT_FOUND");
  });
});

/** Mission 031, Section 15/20 — the domain type returned by getConnection never carries the token. */
describe("MarketingChannelConnection never exposes the access token", () => {
  it("getConnection's return type has no accessToken field", async () => {
    const repo = new DatabaseMarketingChannelRepository(GROWTH_BUSINESS);
    await repo.upsertConnection({ channel: "meta", status: "connected", accessToken: "super-secret-token" });

    const connection = await repo.getConnection("meta");
    expect(connection).not.toBeNull();
    expect(connection).not.toHaveProperty("accessToken");
  });

  it("getConnectionWithToken (the server-only path) does return it, for the provider to actually use", async () => {
    const repo = new DatabaseMarketingChannelRepository(GROWTH_BUSINESS);
    await repo.upsertConnection({ channel: "whatsapp", status: "connected", accessToken: "super-secret-token" });

    const connection = await repo.getConnectionWithToken("whatsapp");
    expect(connection?.accessToken).toBe("super-secret-token");
  });
});

describe("Cross-business channel connection isolation (Mission 031, Section 20)", () => {
  it("business A's connection is invisible to business B", async () => {
    const repoA = new DatabaseMarketingChannelRepository(GROWTH_BUSINESS);
    const repoB = new DatabaseMarketingChannelRepository(STARTER_BUSINESS);
    await repoA.upsertConnection({ channel: "meta", status: "connected", accessToken: "a-token" });

    const connectionForB = await repoB.getConnection("meta");
    expect(connectionForB).toBeNull();
  });
});

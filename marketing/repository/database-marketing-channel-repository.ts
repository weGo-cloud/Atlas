import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  marketingChannelConnections,
  marketingPublications,
  type MarketingChannelConnectionRow,
  type MarketingPublicationRow,
} from "@/lib/db/schema";
import type {
  ConnectionStatus,
  MarketingChannel,
  MarketingChannelConnection,
  MarketingPublication,
  PublicationStatus,
} from "../domain/marketing-channel";

export type UpsertConnectionInput = {
  channel: MarketingChannel;
  status: ConnectionStatus;
  externalAccountLabel?: string | null;
  accessToken?: string | null;
};

export type CreatePublicationInput = {
  marketingContentId: string;
  channel: MarketingChannel;
  status: PublicationStatus;
  isSimulated: boolean;
  externalId?: string | null;
  errorMessage?: string | null;
};

export interface MarketingChannelRepository {
  getConnection(channel: MarketingChannel): Promise<MarketingChannelConnection | null>;
  /** Server-only — includes the access token, unlike getConnection. Only ChannelProvider implementations call this. */
  getConnectionWithToken(channel: MarketingChannel): Promise<(MarketingChannelConnection & { accessToken: string | null }) | null>;
  upsertConnection(input: UpsertConnectionInput): Promise<MarketingChannelConnection>;
}

export interface MarketingPublicationRepository {
  create(input: CreatePublicationInput): Promise<MarketingPublication>;
  listForContent(marketingContentId: string): Promise<MarketingPublication[]>;
}

export class DatabaseMarketingChannelRepository implements MarketingChannelRepository {
  constructor(private readonly businessId: string) {}

  async getConnection(channel: MarketingChannel): Promise<MarketingChannelConnection | null> {
    const row = await this.getRow(channel);
    return row ? toConnection(row) : null;
  }

  async getConnectionWithToken(
    channel: MarketingChannel
  ): Promise<(MarketingChannelConnection & { accessToken: string | null }) | null> {
    const row = await this.getRow(channel);
    return row ? { ...toConnection(row), accessToken: row.accessToken } : null;
  }

  async upsertConnection(input: UpsertConnectionInput): Promise<MarketingChannelConnection> {
    const existing = await this.getRow(input.channel);
    const now = new Date().toISOString();

    if (existing) {
      await db
        .update(marketingChannelConnections)
        .set({
          status: input.status,
          ...(input.externalAccountLabel !== undefined ? { externalAccountLabel: input.externalAccountLabel } : {}),
          ...(input.accessToken !== undefined ? { accessToken: input.accessToken } : {}),
          updatedAt: now,
        })
        .where(eq(marketingChannelConnections.id, existing.id));
    } else {
      await db.insert(marketingChannelConnections).values({
        id: generateId("mktconn"),
        businessId: this.businessId,
        channel: input.channel,
        status: input.status,
        externalAccountLabel: input.externalAccountLabel ?? null,
        accessToken: input.accessToken ?? null,
        updatedAt: now,
      });
    }

    const row = await this.getRow(input.channel);
    if (!row) throw new Error("Failed to read back connection.");
    return toConnection(row);
  }

  private async getRow(channel: MarketingChannel): Promise<MarketingChannelConnectionRow | null> {
    const rows = await db
      .select()
      .from(marketingChannelConnections)
      .where(and(eq(marketingChannelConnections.businessId, this.businessId), eq(marketingChannelConnections.channel, channel)))
      .limit(1);
    return rows[0] ?? null;
  }
}

export class DatabaseMarketingPublicationRepository implements MarketingPublicationRepository {
  constructor(private readonly businessId: string) {}

  async create(input: CreatePublicationInput): Promise<MarketingPublication> {
    const id = generateId("mktpub");
    const now = new Date().toISOString();
    await db.insert(marketingPublications).values({
      id,
      businessId: this.businessId,
      marketingContentId: input.marketingContentId,
      channel: input.channel,
      status: input.status,
      isSimulated: input.isSimulated,
      externalId: input.externalId ?? null,
      errorMessage: input.errorMessage ?? null,
      createdAt: now,
    });

    const rows = await db.select().from(marketingPublications).where(eq(marketingPublications.id, id)).limit(1);
    return toPublication(rows[0]);
  }

  async listForContent(marketingContentId: string): Promise<MarketingPublication[]> {
    const rows = await db
      .select()
      .from(marketingPublications)
      .where(and(eq(marketingPublications.marketingContentId, marketingContentId), eq(marketingPublications.businessId, this.businessId)))
      .orderBy(desc(marketingPublications.createdAt));
    return rows.map(toPublication);
  }
}

function toConnection(row: MarketingChannelConnectionRow): MarketingChannelConnection {
  return {
    id: row.id,
    businessId: row.businessId,
    channel: row.channel as MarketingChannel,
    status: row.status as ConnectionStatus,
    externalAccountLabel: row.externalAccountLabel,
    updatedAt: row.updatedAt,
  };
}

function toPublication(row: MarketingPublicationRow): MarketingPublication {
  return {
    id: row.id,
    businessId: row.businessId,
    marketingContentId: row.marketingContentId,
    channel: row.channel as MarketingChannel,
    status: row.status as PublicationStatus,
    isSimulated: row.isSimulated,
    externalId: row.externalId,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}

let counter = 0;
function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

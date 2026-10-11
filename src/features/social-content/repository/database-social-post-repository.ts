import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { socialPosts, type SocialPostRow } from "@/lib/db/schema";
import type { MarketableItemType } from "../../marketing/domain/marketing-item-ref";
import type { PostStatus, PostTemplateId, SocialPost } from "../domain/social-post";
import type { CreateSocialPostInput, ListSocialPostsFilter, SocialPostRepository } from "./social-post-repository";

let counter = 0;
function generateId(): string {
  counter += 1;
  return `sp_${Date.now().toString(36)}${counter.toString(36)}`;
}

function toSocialPost(row: SocialPostRow): SocialPost {
  return {
    id: row.id,
    businessId: row.businessId,
    itemType: row.itemType as MarketableItemType,
    itemId: row.itemId,
    templateId: row.templateId as PostTemplateId,
    photoUrl: row.photoUrl,
    caption: row.caption,
    imageUrl: row.imageUrl,
    status: row.status as PostStatus,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
  };
}

export class DatabaseSocialPostRepository implements SocialPostRepository {
  constructor(private readonly businessId: string) {}

  async create(input: CreateSocialPostInput): Promise<SocialPost> {
    const id = generateId();
    const now = new Date().toISOString();
    await db.insert(socialPosts).values({
      id,
      businessId: this.businessId,
      itemType: input.itemType,
      itemId: input.itemId,
      templateId: input.templateId,
      photoUrl: input.photoUrl,
      caption: input.caption,
      imageUrl: input.imageUrl,
      status: "draft",
      createdAt: now,
      approvedAt: null,
    });
    const created = await this.getById(id);
    if (!created) throw new Error("Failed to read back newly created social post.");
    return created;
  }

  async getById(id: string): Promise<SocialPost | null> {
    const rows = await db
      .select()
      .from(socialPosts)
      .where(and(eq(socialPosts.id, id), eq(socialPosts.businessId, this.businessId)))
      .limit(1);
    return rows[0] ? toSocialPost(rows[0]) : null;
  }

  async updateCaption(id: string, caption: string): Promise<SocialPost | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    await db.update(socialPosts).set({ caption }).where(and(eq(socialPosts.id, id), eq(socialPosts.businessId, this.businessId)));
    return this.getById(id);
  }

  /**
   * Atomic conditional UPDATE — same pattern as LeadRepository.completeFollowUp
   * (Mission 017 fix): the WHERE clause requires status="draft", and
   * `result.changes` tells us whether *this* call was the one that
   * actually flipped it, collapsing read-then-write into one
   * statement so two concurrent approve calls (e.g. a double-click)
   * can't both report success for the same post.
   */
  async approve(id: string, now: string): Promise<SocialPost | null> {
    const result = await db
      .update(socialPosts)
      .set({ status: "approved", approvedAt: now })
      .where(and(eq(socialPosts.id, id), eq(socialPosts.businessId, this.businessId), eq(socialPosts.status, "draft")));

    if (result.changes === 0) {
      // Either it doesn't exist/isn't ours, or it was already approved
      // (including "someone else's concurrent call just approved it").
      return null;
    }
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;
    await db.delete(socialPosts).where(and(eq(socialPosts.id, id), eq(socialPosts.businessId, this.businessId)));
    return true;
  }

  async list(filter: ListSocialPostsFilter = {}): Promise<SocialPost[]> {
    const conditions = [eq(socialPosts.businessId, this.businessId)];
    if (filter.status) conditions.push(eq(socialPosts.status, filter.status));
    const rows = await db
      .select()
      .from(socialPosts)
      .where(and(...conditions))
      .orderBy(desc(socialPosts.createdAt))
      .limit(Math.min(filter.limit ?? 50, 200));
    return rows.map(toSocialPost);
  }
}

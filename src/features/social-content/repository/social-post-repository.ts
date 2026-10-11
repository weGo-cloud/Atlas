import type { MarketableItemType } from "../../marketing/domain/marketing-item-ref";
import type { PostStatus, PostTemplateId, SocialPost } from "../domain/social-post";

export type CreateSocialPostInput = {
  itemType: MarketableItemType;
  itemId: string;
  templateId: PostTemplateId;
  photoUrl: string;
  caption: string;
  imageUrl: string;
};

export type ListSocialPostsFilter = {
  status?: PostStatus;
  limit?: number;
};

export interface SocialPostRepository {
  create(input: CreateSocialPostInput): Promise<SocialPost>;
  getById(id: string): Promise<SocialPost | null>;
  updateCaption(id: string, caption: string): Promise<SocialPost | null>;
  approve(id: string, now: string): Promise<SocialPost | null>;
  delete(id: string): Promise<boolean>;
  list(filter?: ListSocialPostsFilter): Promise<SocialPost[]>;
}

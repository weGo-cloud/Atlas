"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { getSocialContentService } from "../service";
import type { SocialContentServiceError } from "../domain/errors";
import type { PostTemplateId, SocialPost } from "../domain/social-post";
import type { MarketableItemRef } from "../../marketing/domain/marketing-item-ref";

export type SocialPostActionResult = { ok: true; post: SocialPost } | { ok: false; error: SocialContentServiceError };

function revalidatePaths() {
  // /app/inventory/[id] branches server-side on business.vertical (same route for both verticals — see marketing-actions.ts).
  revalidatePath("/app/inventory");
  revalidatePath("/app/social-posts");
}

export async function generateSocialPostAction(input: MarketableItemRef & { templateId: PostTemplateId; photoUrl: string }): Promise<SocialPostActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getSocialContentService(business.id).generate(input);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePaths();
  return { ok: true, post: result.data };
}

export async function updateSocialPostCaptionAction(postId: string, caption: string): Promise<SocialPostActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getSocialContentService(business.id).updateCaption(postId, caption);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePaths();
  return { ok: true, post: result.data };
}

export async function approveSocialPostAction(postId: string): Promise<SocialPostActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getSocialContentService(business.id).approve(postId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePaths();
  return { ok: true, post: result.data };
}

export async function deleteSocialPostAction(formData: FormData): Promise<void> {
  const { business } = await requireCurrentSession();
  const postId = formData.get("postId");
  if (typeof postId !== "string" || !postId) return;
  await getSocialContentService(business.id).delete(postId);
  revalidatePaths();
}

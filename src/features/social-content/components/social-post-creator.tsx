"use client";

import { useState } from "react";
import { Check, Download, ImagePlus, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { approveSocialPostAction, generateSocialPostAction, updateSocialPostCaptionAction } from "../actions/social-content-actions";
import { POST_TEMPLATES, POST_TEMPLATE_DESCRIPTION, POST_TEMPLATE_LABEL, type PostTemplateId, type SocialPost } from "../domain/social-post";
import type { MarketableItemType } from "../../marketing/domain/marketing-item-ref";

type Photo = { id: string; url: string; isPrimary: boolean };

type SocialPostCreatorProps = {
  itemType: MarketableItemType;
  itemId: string;
  photos: Photo[];
  canUse: boolean;
};

type Status = "idle" | "generating" | "saving" | "approving";

/**
 * Mission 034 — the staff-facing "create a social post" flow: pick a
 * template, pick one of the item's REAL uploaded photos, review the
 * already-grounded AI caption (from MarketingContentService, edit
 * freely), see the actual rendered PNG, approve or download it.
 * Nothing here invents a photo, a fact, or an image — see
 * SocialContentService.generate for where that's enforced.
 */
export function SocialPostCreator({ itemType, itemId, photos, canUse }: SocialPostCreatorProps) {
  const [templateId, setTemplateId] = useState<PostTemplateId>("featured_item");
  const [photoUrl, setPhotoUrl] = useState<string | null>(photos.find((p) => p.isPrimary)?.url ?? photos[0]?.url ?? null);
  const [post, setPost] = useState<SocialPost | null>(null);
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  if (!canUse) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Social post</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Image posts aren&apos;t available on your current plan.
        </CardContent>
      </Card>
    );
  }

  async function handleGenerate() {
    if (!photoUrl) return;
    setStatus("generating");
    setError(null);
    const result = await generateSocialPostAction({ itemType, itemId, templateId, photoUrl });
    setStatus("idle");
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPost(result.post);
    setCaption(result.post.caption);
  }

  async function handleSaveCaption() {
    if (!post) return;
    setStatus("saving");
    const result = await updateSocialPostCaptionAction(post.id, caption);
    setStatus("idle");
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPost(result.post);
  }

  async function handleApprove() {
    if (!post) return;
    setStatus("approving");
    const result = await approveSocialPostAction(post.id);
    setStatus("idle");
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPost(result.post);
  }

  const approved = post?.status === "approved";

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-intelligence/10 text-intelligence">
          <ImagePlus className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-base">Social post</CardTitle>
          <p className="text-sm text-muted-foreground">Turn this item&apos;s real photo into a ready-to-post image.</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {photos.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-strong bg-surface-2 px-3 py-4 text-sm text-muted-foreground">
            Add a photo to this item first — a social post always uses a real uploaded photo.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Template</span>
              <div className="flex flex-wrap gap-1.5">
                {POST_TEMPLATES.map((id) => (
                  <button
                    key={id}
                    type="button"
                    title={POST_TEMPLATE_DESCRIPTION[id]}
                    onClick={() => setTemplateId(id)}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      templateId === id ? "border-primary/40 bg-primary/10 text-primary" : "border-border-strong text-muted-foreground hover:bg-surface-2"
                    )}
                  >
                    {POST_TEMPLATE_LABEL[id]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Photo</span>
              <div className="flex flex-wrap gap-2">
                {photos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    aria-pressed={photoUrl === photo.url}
                    onClick={() => setPhotoUrl(photo.url)}
                    className={cn(
                      "h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      photoUrl === photo.url ? "border-primary" : "border-transparent"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {!post ? (
              <Button onClick={handleGenerate} disabled={!photoUrl || status === "generating"} className="w-fit gap-1.5">
                {status === "generating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate post
              </Button>
            ) : (
              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <div className="flex justify-center overflow-hidden rounded-lg border border-border bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.imageUrl} alt="Generated social post preview" className="max-h-96 w-full max-w-96 object-contain" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Caption</span>
                  <Textarea
                    rows={4}
                    value={caption}
                    disabled={approved}
                    onChange={(e) => setCaption(e.target.value)}
                    onBlur={() => !approved && caption !== post.caption && handleSaveCaption()}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {approved ? (
                    <Badge variant="success" dot>
                      Approved
                    </Badge>
                  ) : (
                    <Button size="sm" onClick={handleApprove} disabled={status === "approving"} className="gap-1.5">
                      {status === "approving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Approve
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a href={post.imageUrl} download={`${itemId}-${post.templateId}.png`}>
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPost(null)}>
                    Start over
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

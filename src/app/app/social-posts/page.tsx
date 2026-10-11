import Link from "next/link";
import { ImagePlus } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { deleteSocialPostAction } from "@/features/social-content/actions/social-content-actions";
import { POST_STATUSES, POST_TEMPLATE_LABEL, type PostStatus } from "@/features/social-content/domain/social-post";
import { canUseSocialContent, getSocialContentService } from "@/features/social-content/service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Social posts" };

const STATUS_LABEL: Record<PostStatus, string> = { draft: "Draft", approved: "Approved" };

function buildHref(status?: string): string {
  return status ? `/app/social-posts?status=${status}` : "/app/social-posts";
}

/**
 * Mission 034 — the library of every generated post across the
 * business (mission spec §4.4). Deliberately read-only beyond
 * approve/delete (both live on the item's own SocialPostCreator and
 * here as a delete-only action) — a "Publish" button belongs to a
 * later mission and isn't added here.
 */
export default async function SocialPostsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { business } = await requireCurrentSession();
  const { status: rawStatus } = await searchParams;
  const status = POST_STATUSES.find((value) => value === rawStatus);

  const [canUse, posts] = await Promise.all([canUseSocialContent(business.id), getSocialContentService(business.id).list({ status })]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Social posts" description="Generated image posts, ready to review and download." />

      {!canUse ? (
        <p className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
          Image posts aren&apos;t available on your current plan.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by status">
        <Link
          href={buildHref()}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            !status ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          )}
        >
          All
        </Link>
        {POST_STATUSES.map((value) => (
          <Link
            key={value}
            href={buildHref(value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              status === value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            )}
          >
            {STATUS_LABEL[value]}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={ImagePlus}
          title="No social posts yet"
          description="Generate one from any vehicle or furniture item's detail page."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {posts.map((post) => (
            <div key={post.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
              <Link href={`/app/inventory/${post.itemId}`} className="block aspect-square w-full overflow-hidden bg-surface-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
              </Link>
              <div className="flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-muted-foreground">{POST_TEMPLATE_LABEL[post.templateId]}</span>
                  <Badge variant={post.status === "approved" ? "success" : "default"}>{STATUS_LABEL[post.status]}</Badge>
                </div>
                <p className="line-clamp-2 text-sm text-foreground">{post.caption}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={post.imageUrl} download={`${post.itemId}-${post.templateId}.png`}>
                      Download
                    </a>
                  </Button>
                  <form action={deleteSocialPostAction}>
                    <input type="hidden" name="postId" value={post.id} />
                    <Button type="submit" size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10">
                      Delete
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

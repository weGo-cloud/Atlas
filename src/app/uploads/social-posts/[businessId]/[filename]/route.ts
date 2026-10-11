import { readFile, stat } from "node:fs/promises";

import { resolveSocialPostImagePath } from "@/lib/storage/social-post-storage";
import { getCurrentSession } from "@/features/auth/lib/current-session";

type RouteParams = {
  params: Promise<{ businessId: string; filename: string }>;
};

/**
 * Serves a generated social post image. Mirrors the vehicle/furniture
 * photo routes exactly (Mission 014's audit finding applied from the
 * start here): a session is required, and the business segment of the
 * URL must match the signed-in session's own business — never any
 * business id a caller supplies — before the filesystem is touched.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { businessId, filename } = await params;

  const session = await getCurrentSession();
  if (!session || session.business.id !== businessId) {
    return new Response("Not found", { status: 404 });
  }

  const resolvedPath = resolveSocialPostImagePath(businessId, filename);
  if (!resolvedPath) {
    return new Response("Not found", { status: 404 });
  }

  try {
    await stat(resolvedPath);
    const buffer = await readFile(resolvedPath);
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

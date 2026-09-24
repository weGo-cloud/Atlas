import { readFile, stat } from "node:fs/promises";

import { resolveFurniturePhotoPath } from "@/lib/storage/furniture-photo-storage";

type RouteParams = {
  params: Promise<{ productId: string; filename: string }>;
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Serves a locally stored furniture product photo — the Furniture
 * counterpart to `src/app/uploads/vehicles/[vehicleId]/[filename]/route.ts`,
 * with one deliberate difference: **no session is required here.**
 *
 * The vehicle photo route requires a signed-in session because
 * nothing in the Auto storefront ever renders a vehicle photo (see
 * `conversion/auto/auto-catalog-adapter.ts` — CatalogItem had no
 * image field before this mission), so vehicle photos have only ever
 * needed to be reachable by staff. Furniture photos *do* need to be
 * visible to anonymous storefront visitors (Mission 030, Section 10/
 * 11 — "photographs" is an explicit requirement of both the product
 * detail page and the storefront). Making this route public is
 * additive: it doesn't change what's reachable for Auto, and no
 * private data is at risk here — the URL's filename segment is a
 * randomly generated UUID (see photo-storage.ts's savePhoto), so
 * there's nothing to enumerate, and resolveFurniturePhotoPath still
 * rejects anything that isn't an exact match for that generated
 * pattern (Section 27: no arbitrary filesystem paths reachable via
 * URL, same as the vehicle route).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { productId, filename } = await params;

  const resolvedPath = resolveFurniturePhotoPath(productId, filename);
  if (!resolvedPath) {
    return new Response("Not found", { status: 404 });
  }

  try {
    await stat(resolvedPath);
    const buffer = await readFile(resolvedPath);
    const extension = filename.split(".").pop() ?? "";
    const contentType = CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

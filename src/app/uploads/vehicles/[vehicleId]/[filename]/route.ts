import { readFile, stat } from "node:fs/promises";

import { resolveVehiclePhotoPath } from "@/lib/storage/vehicle-photo-storage";
import { getCurrentSession } from "@/features/auth/lib/current-session";
import { getVehicleService } from "@/features/inventory/service";

type RouteParams = {
  params: Promise<{ vehicleId: string; filename: string }>;
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Serves a locally stored vehicle photo. This is the only way stored
 * photo files are ever reachable over HTTP — resolveVehiclePhotoPath
 * rejects anything that isn't an exact match for our own generated
 * filename pattern, so this never becomes a general-purpose file
 * server for the storage directory.
 *
 * Mission 014 audit finding: this route previously served files with
 * no session check and no business-scoping at all — every other read
 * in the app goes through requireCurrentSession() and a
 * business-scoped repository, but a photo URL alone was enough to
 * fetch the bytes, from any business, signed in or not. Fixed below:
 * a session is required, and the vehicle is looked up through
 * getVehicleService(business.id) — the same business-scoped service
 * every other feature uses — so a vehicle from another business
 * resolves to nothing before the filesystem is ever touched.
 * <img src> requests are same-origin, so the browser sends the
 * session cookie automatically; no client change was needed for
 * logged-in users to keep seeing photos exactly as before.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { vehicleId, filename } = await params;

  const session = await getCurrentSession();
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const vehicleResult = await getVehicleService(session.business.id).getVehicle(vehicleId);
  if (!vehicleResult.ok) {
    return new Response("Not found", { status: 404 });
  }

  const resolvedPath = resolveVehiclePhotoPath(vehicleId, filename);
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
        // Filenames are content-addressed-ish (random, never reused
        // for different content), so a long, immutable cache is safe.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

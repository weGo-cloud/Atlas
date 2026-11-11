import { deletePhoto, detectImageMimeType as detectImageMimeTypeGeneric, resolvePhotoPath, savePhoto, type SavedPhotoFile } from "./photo-storage";

/**
 * Mission 034 — thin wrapper around the same generalized photo-storage
 * core vehicles/furniture-products already use (Mission 030), with
 * namespace "social-posts". Rendered images are never written under
 * `public/` and are only ever reachable through the validated serving
 * route, exactly like every other uploaded/generated image in Atlas.
 */
const NAMESPACE = "social-posts";
const URL_PREFIX = "uploads/social-posts";

function storageDirOverride(): string | undefined {
  return process.env.SOCIAL_POST_STORAGE_DIR;
}

export function detectImageMimeType(buffer: Buffer) {
  return detectImageMimeTypeGeneric(buffer);
}

export type { SavedPhotoFile };

export async function saveSocialPostImage(input: { businessId: string; buffer: Buffer }): Promise<SavedPhotoFile> {
  return savePhoto({
    namespace: NAMESPACE,
    urlPrefix: URL_PREFIX,
    ownerId: input.businessId,
    buffer: input.buffer,
    mimeType: "image/png",
    storageDirEnvOverride: storageDirOverride(),
  });
}

export async function deleteSocialPostImage(url: string): Promise<void> {
  return deletePhoto({ namespace: NAMESPACE, urlPrefix: URL_PREFIX, url, storageDirEnvOverride: storageDirOverride() });
}

export function resolveSocialPostImagePath(businessId: string, filename: string): string | null {
  return resolvePhotoPath({ namespace: NAMESPACE, ownerId: businessId, filename, storageDirEnvOverride: storageDirOverride() });
}

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Mission 030, Section 9 — "reuse the existing Atlas media
 * architecture... do not create a second unrelated image-upload
 * system if the existing vehicle-photo architecture can be
 * generalized safely." This is that generalization: the exact same
 * security-relevant logic `vehicle-photo-storage.ts` had (magic-byte
 * detection, generated-not-user-supplied filenames, path-containment
 * checks on both save and delete), parameterized by a `namespace`
 * (e.g. "vehicles", "furniture-products") instead of hardcoding one.
 *
 * `vehicle-photo-storage.ts` is refactored to a thin wrapper around
 * this module with `namespace: "vehicles"` — its exported function
 * names, signatures, and behavior are unchanged, so nothing that
 * already imports it (VehiclePhotoService, VehicleService, the photo
 * serving route, and their tests) needed to change.
 * `furniture-photo-storage.ts` is a second thin wrapper with
 * `namespace: "furniture-products"`. Neither vertical's storage code
 * knows the other exists.
 */
export type PhotoMimeType = "image/jpeg" | "image/png" | "image/webp";

const EXTENSION_BY_MIME: Record<PhotoMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function getStorageRoot(namespace: string, envOverride?: string): string {
  return envOverride ?? path.join(process.cwd(), "storage", namespace);
}

/**
 * Sniffs a file's actual format from its magic bytes rather than
 * trusting the browser-reported MIME type or filename extension —
 * both are attacker-controlled and easy to spoof.
 */
export function detectImageMimeType(buffer: Buffer): PhotoMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }

  return null;
}

export type SavedPhotoFile = {
  url: string;
  storedPath: string;
};

/**
 * Persists an image buffer to local disk under a generated,
 * collision-resistant filename, at `/{urlPrefix}/{ownerId}/{filename}`.
 * The original uploaded filename is never used to build a path —
 * that's what actually prevents path traversal.
 */
export async function savePhoto(input: {
  namespace: string;
  urlPrefix: string;
  ownerId: string;
  buffer: Buffer;
  mimeType: PhotoMimeType;
  storageDirEnvOverride?: string;
}): Promise<SavedPhotoFile> {
  const storageRoot = getStorageRoot(input.namespace, input.storageDirEnvOverride);
  const ownerSegment = safeSegment(input.ownerId);
  const ownerDir = path.join(/* turbopackIgnore: true */ storageRoot, ownerSegment);
  await mkdir(ownerDir, { recursive: true });

  const extension = EXTENSION_BY_MIME[input.mimeType];
  const filename = `${randomUUID()}.${extension}`;
  const storedPath = path.join(/* turbopackIgnore: true */ ownerDir, filename);

  await writeFile(storedPath, input.buffer);

  return {
    url: `/${input.urlPrefix}/${ownerSegment}/${filename}`,
    storedPath,
  };
}

/**
 * Deletes a previously saved photo, given the URL savePhoto returned.
 * Re-validates that the resolved path stays inside the storage root.
 * Missing files are treated as already-deleted (idempotent).
 */
export async function deletePhoto(input: {
  namespace: string;
  urlPrefix: string;
  url: string;
  storageDirEnvOverride?: string;
}): Promise<void> {
  const storageRoot = getStorageRoot(input.namespace, input.storageDirEnvOverride);
  const relative = input.url.replace(new RegExp(`^/${input.urlPrefix}/`), "");
  const resolved = path.join(/* turbopackIgnore: true */ storageRoot, relative);

  if (!resolved.startsWith(storageRoot + path.sep)) {
    throw new Error("Refusing to delete a path outside the photo storage root.");
  }

  try {
    await unlink(resolved);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") throw error;
  }
}

/**
 * Resolves an (ownerId, filename) pair from an incoming request to an
 * absolute path strictly inside the storage root, or null if either
 * segment doesn't match the safe pattern our own filenames always
 * use. Used by serving route handlers — this is the actual boundary
 * that keeps arbitrary filesystem paths from being reachable via URL.
 */
export function resolvePhotoPath(input: {
  namespace: string;
  ownerId: string;
  filename: string;
  storageDirEnvOverride?: string;
}): string | null {
  const storageRoot = getStorageRoot(input.namespace, input.storageDirEnvOverride);
  const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;
  const SAFE_FILENAME = /^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/;

  if (!SAFE_SEGMENT.test(input.ownerId) || !SAFE_FILENAME.test(input.filename)) {
    return null;
  }

  const resolved = path.join(/* turbopackIgnore: true */ storageRoot, input.ownerId, input.filename);
  if (!resolved.startsWith(storageRoot + path.sep)) {
    return null;
  }

  return resolved;
}

function safeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "");
}

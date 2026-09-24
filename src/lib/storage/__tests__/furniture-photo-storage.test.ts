import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  deleteFurniturePhoto,
  resolveFurniturePhotoPath,
  saveFurniturePhoto,
} from "../furniture-photo-storage";

const testDir = mkdtempSync(path.join(tmpdir(), "atlas-furniture-storage-test-"));

beforeAll(() => {
  process.env.FURNITURE_PHOTO_STORAGE_DIR = testDir;
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

/**
 * Mission 030 — deliberately doesn't re-test detectImageMimeType's
 * magic-byte detection here; that logic moved into the shared
 * lib/storage/photo-storage.ts core (see that file's doc comment) and
 * is already covered by vehicle-photo-storage.test.ts, which exercises
 * the exact same function. What's specific to *this* wrapper is
 * whether it plumbs through to the generic core correctly — the
 * namespace, URL prefix, and env override are all furniture-specific.
 */
describe("resolveFurniturePhotoPath — path safety (Mission 030, Section 27)", () => {
  it("resolves a well-formed productId/filename pair", () => {
    const resolved = resolveFurniturePhotoPath("furn_abc123", "photo-1.jpg");
    expect(resolved).not.toBeNull();
    expect(resolved).toContain(testDir);
  });

  it("rejects a path traversal attempt in the filename", () => {
    expect(resolveFurniturePhotoPath("furn_abc123", "../../etc/passwd")).toBeNull();
  });

  it("rejects a path traversal attempt in the productId segment", () => {
    expect(resolveFurniturePhotoPath("../../etc", "photo-1.jpg")).toBeNull();
  });

  it("rejects a filename with an unsupported extension", () => {
    expect(resolveFurniturePhotoPath("furn_abc123", "photo-1.svg")).toBeNull();
  });

  it("rejects a filename attempting a slash injection", () => {
    expect(resolveFurniturePhotoPath("furn_abc123", "a/b.jpg")).toBeNull();
  });
});

describe("saveFurniturePhoto / deleteFurniturePhoto", () => {
  it("writes a file under the configured storage root with a public /uploads/furniture-products URL", async () => {
    const saved = await saveFurniturePhoto({
      furnitureProductId: "furn_test1",
      buffer: JPEG_HEADER,
      mimeType: "image/jpeg",
    });

    expect(saved.url).toMatch(/^\/uploads\/furniture-products\/furn_test1\/.+\.jpg$/);
    expect(readFileSync(saved.storedPath)).toEqual(JPEG_HEADER);
  });

  it("round-trips through resolveFurniturePhotoPath to the same file", async () => {
    const saved = await saveFurniturePhoto({
      furnitureProductId: "furn_test2",
      buffer: PNG_HEADER,
      mimeType: "image/png",
    });

    const filename = saved.url.split("/").pop()!;
    const resolved = resolveFurniturePhotoPath("furn_test2", filename);
    expect(resolved).toBe(saved.storedPath);
  });

  it("deletes a saved file and is idempotent on a second delete", async () => {
    const saved = await saveFurniturePhoto({
      furnitureProductId: "furn_test3",
      buffer: JPEG_HEADER,
      mimeType: "image/jpeg",
    });

    await expect(deleteFurniturePhoto(saved.url)).resolves.toBeUndefined();
    await expect(deleteFurniturePhoto(saved.url)).resolves.toBeUndefined();
  });
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  deleteVehiclePhoto,
  detectImageMimeType,
  resolveVehiclePhotoPath,
  saveVehiclePhoto,
} from "../vehicle-photo-storage";

const testDir = mkdtempSync(path.join(tmpdir(), "atlas-storage-test-"));

beforeAll(() => {
  process.env.VEHICLE_PHOTO_STORAGE_DIR = testDir;
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// Minimal valid file headers for each accepted format.
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const WEBP_HEADER = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
]);

describe("detectImageMimeType", () => {
  it("detects a JPEG from its magic bytes", () => {
    expect(detectImageMimeType(JPEG_HEADER)).toBe("image/jpeg");
  });

  it("detects a PNG from its magic bytes", () => {
    expect(detectImageMimeType(PNG_HEADER)).toBe("image/png");
  });

  it("detects a WEBP from its magic bytes", () => {
    expect(detectImageMimeType(WEBP_HEADER)).toBe("image/webp");
  });

  it("rejects a file with a spoofed .jpg extension but no real image data", () => {
    const fakeScript = Buffer.from("#!/bin/sh\necho not an image\n", "utf-8");
    expect(detectImageMimeType(fakeScript)).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(detectImageMimeType(Buffer.alloc(0))).toBeNull();
  });

  it("rejects an SVG (not in the accepted format list)", () => {
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(detectImageMimeType(svg)).toBeNull();
  });
});

describe("resolveVehiclePhotoPath", () => {
  it("resolves a well-formed vehicleId/filename pair", () => {
    const resolved = resolveVehiclePhotoPath("veh_abc123", "photo-1.jpg");
    expect(resolved).not.toBeNull();
    expect(resolved).toContain(testDir);
  });

  it("rejects a path traversal attempt in the filename", () => {
    expect(
      resolveVehiclePhotoPath("veh_abc123", "../../etc/passwd")
    ).toBeNull();
  });

  it("rejects a path traversal attempt in the vehicleId segment", () => {
    expect(resolveVehiclePhotoPath("../../etc", "photo-1.jpg")).toBeNull();
  });

  it("rejects a filename with an unsupported extension", () => {
    expect(resolveVehiclePhotoPath("veh_abc123", "photo-1.svg")).toBeNull();
  });

  it("rejects a filename attempting a null-byte or slash injection", () => {
    expect(resolveVehiclePhotoPath("veh_abc123", "a/b.jpg")).toBeNull();
  });
});

describe("saveVehiclePhoto / deleteVehiclePhoto", () => {
  it("writes a file under the configured storage root and returns a matching url", async () => {
    const saved = await saveVehiclePhoto({
      vehicleId: "veh_test1",
      buffer: JPEG_HEADER,
      mimeType: "image/jpeg",
    });

    expect(saved.url).toMatch(/^\/uploads\/vehicles\/veh_test1\/.+\.jpg$/);
    expect(readFileSync(saved.storedPath)).toEqual(JPEG_HEADER);
  });

  it("round-trips through resolveVehiclePhotoPath to the same file", async () => {
    const saved = await saveVehiclePhoto({
      vehicleId: "veh_test2",
      buffer: PNG_HEADER,
      mimeType: "image/png",
    });

    const filename = saved.url.split("/").pop()!;
    const resolved = resolveVehiclePhotoPath("veh_test2", filename);
    expect(resolved).toBe(saved.storedPath);
  });

  it("deletes a saved file and is idempotent on a second delete", async () => {
    const saved = await saveVehiclePhoto({
      vehicleId: "veh_test3",
      buffer: WEBP_HEADER,
      mimeType: "image/webp",
    });

    await expect(deleteVehiclePhoto(saved.url)).resolves.toBeUndefined();
    // Second delete of the same (now-missing) file should not throw.
    await expect(deleteVehiclePhoto(saved.url)).resolves.toBeUndefined();
  });
});

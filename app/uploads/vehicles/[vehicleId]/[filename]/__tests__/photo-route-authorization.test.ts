import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ActionTestHarness } from "../../../../../../test-support/action-test-harness";

const harness = new ActionTestHarness();
const storageDir = mkdtempSync(path.join(tmpdir(), "atlas-photo-storage-"));

beforeAll(async () => {
  process.env.VEHICLE_PHOTO_STORAGE_DIR = storageDir;
  await harness.setup();
});

afterAll(() => {
  harness.teardown();
  rmSync(storageDir, { recursive: true, force: true });
  delete process.env.VEHICLE_PHOTO_STORAGE_DIR;
});

afterEach(() => {
  harness.reset();
});

/**
 * Mission 014 audit finding: this route previously served any stored
 * photo to anyone, session or no session, any business or none. These
 * tests prove the fix — see route.ts for the change.
 */
describe("vehicle photo serving route — authentication + business scoping", () => {
  it("no session — 404, not the file", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    await harness.signIn(staff);

    const { saveVehiclePhoto } = await import("../../../../../../lib/storage/vehicle-photo-storage");
    const vehicle = harness.seedVehicle(business.id);
    const saved = await saveVehiclePhoto({
      vehicleId: vehicle.id,
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0]),
      mimeType: "image/jpeg",
    });
    const filename = saved.url.split("/").pop()!;

    harness.signOut();
    const { GET } = await import("../route");
    const response = await GET(new Request("http://localhost/uploads/vehicles/x/y"), {
      params: Promise.resolve({ vehicleId: vehicle.id, filename }),
    });
    expect(response.status).toBe(404);
  });

  it("signed in, but the vehicle belongs to a different business — 404, not the file", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffB = await harness.seedUser(businessB.id, "staff");
    const staffA = await harness.seedUser(businessA.id, "staff");

    await harness.signIn(staffB);
    const { saveVehiclePhoto } = await import("../../../../../../lib/storage/vehicle-photo-storage");
    const vehicleB = harness.seedVehicle(businessB.id);
    const saved = await saveVehiclePhoto({
      vehicleId: vehicleB.id,
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0]),
      mimeType: "image/jpeg",
    });
    const filename = saved.url.split("/").pop()!;

    // Now sign in as business A and try to fetch business B's photo.
    await harness.signIn(staffA);
    const { GET } = await import("../route");
    const response = await GET(new Request("http://localhost/uploads/vehicles/x/y"), {
      params: Promise.resolve({ vehicleId: vehicleB.id, filename }),
    });
    expect(response.status).toBe(404);
  });

  it("signed in, own business's vehicle — 200 with the file", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    await harness.signIn(staff);

    const { saveVehiclePhoto } = await import("../../../../../../lib/storage/vehicle-photo-storage");
    const vehicle = harness.seedVehicle(business.id);
    const saved = await saveVehiclePhoto({
      vehicleId: vehicle.id,
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0]),
      mimeType: "image/jpeg",
    });
    const filename = saved.url.split("/").pop()!;

    const { GET } = await import("../route");
    const response = await GET(new Request("http://localhost/uploads/vehicles/x/y"), {
      params: Promise.resolve({ vehicleId: vehicle.id, filename }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
  });
});

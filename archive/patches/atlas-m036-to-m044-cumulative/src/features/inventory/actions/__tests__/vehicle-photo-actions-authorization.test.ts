import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ActionTestHarness } from "../../../../test-support/action-test-harness";

const harness = new ActionTestHarness();

beforeAll(async () => {
  await harness.setup();
});

afterAll(() => {
  harness.teardown();
});

afterEach(() => {
  harness.reset();
});

describe("vehicle photo actions — operational (staff-permitted, per baseline policy)", () => {
  it("staff can delete, reorder, and set-primary a photo on their own business's vehicle", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const vehicle = harness.seedVehicle(business.id);
    const photoA = harness.seedVehiclePhoto(vehicle.id, 0);
    const photoB = harness.seedVehiclePhoto(vehicle.id, 1);
    await harness.signIn(staff);

    const { reorderVehiclePhotosAction, setPrimaryVehiclePhotoAction, deleteVehiclePhotoAction } =
      await import("../vehicle-photo-actions");

    const reordered = await reorderVehiclePhotosAction(vehicle.id, [photoB.id, photoA.id]);
    expect(reordered.ok).toBe(true);

    const primaried = await setPrimaryVehiclePhotoAction(vehicle.id, photoB.id);
    expect(primaried.ok).toBe(true);

    const deleted = await deleteVehiclePhotoAction(vehicle.id, photoA.id);
    expect(deleted.ok).toBe(true);
  });
});

describe("vehicle photo actions — cross-business IDOR (Mission 014 fix)", () => {
  it("staff of business A cannot delete a photo belonging to business B's vehicle", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const vehicleB = harness.seedVehicle(businessB.id);
    const photoB = harness.seedVehiclePhoto(vehicleB.id);
    await harness.signIn(staffA);

    const { deleteVehiclePhotoAction } = await import("../vehicle-photo-actions");
    const result = await deleteVehiclePhotoAction(vehicleB.id, photoB.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VEHICLE_NOT_FOUND");
    const row = harness.row("SELECT id FROM vehicle_photos WHERE id = ?", photoB.id);
    expect(row).toBeDefined();
  });

  it("owner of business A cannot set-primary a photo belonging to business B's vehicle", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const ownerA = await harness.seedUser(businessA.id, "owner");
    const vehicleB = harness.seedVehicle(businessB.id);
    const photoB = harness.seedVehiclePhoto(vehicleB.id, 0, false);
    await harness.signIn(ownerA);

    const { setPrimaryVehiclePhotoAction } = await import("../vehicle-photo-actions");
    const result = await setPrimaryVehiclePhotoAction(vehicleB.id, photoB.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VEHICLE_NOT_FOUND");
    const row = harness.row<{ is_primary: number }>(
      "SELECT is_primary FROM vehicle_photos WHERE id = ?",
      photoB.id
    );
    expect(row?.is_primary).toBe(0);
  });

  it("business A cannot reorder business B's vehicle photos", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const vehicleB = harness.seedVehicle(businessB.id);
    const photoB = harness.seedVehiclePhoto(vehicleB.id);
    await harness.signIn(staffA);

    const { reorderVehiclePhotosAction } = await import("../vehicle-photo-actions");
    const result = await reorderVehiclePhotosAction(vehicleB.id, [photoB.id]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VEHICLE_NOT_FOUND");
  });

  it("no session — photo actions redirect (rejected before any data access)", async () => {
    const business = harness.seedBusiness();
    const vehicle = harness.seedVehicle(business.id);
    const photo = harness.seedVehiclePhoto(vehicle.id);
    harness.signOut();

    const { deleteVehiclePhotoAction } = await import("../vehicle-photo-actions");
    await expect(deleteVehiclePhotoAction(vehicle.id, photo.id)).rejects.toThrow();
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ActionTestHarness } from "../../../../test-support/action-test-harness";

/**
 * Calls the actual exported "use server" action functions — not a
 * reimplementation of their logic — against a real, migrated SQLite
 * database. See test-support/vitest.setup.ts for how this is possible.
 */
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

describe("vehicle actions — destructive operation (vehicle.delete)", () => {
  it("owner can delete a vehicle in their own business", async () => {
    const business = harness.seedBusiness();
    const owner = await harness.seedUser(business.id, "owner");
    const vehicle = harness.seedVehicle(business.id);
    await harness.signIn(owner);

    const { deleteVehicleAction } = await import("../vehicle-actions");
    const result = await deleteVehicleAction(vehicle.id);

    expect(result.ok).toBe(true);
    const row = harness.row("SELECT id FROM vehicles WHERE id = ?", vehicle.id);
    expect(row).toBeUndefined();
  });

  it("staff is rejected — vehicle row is provably untouched", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const vehicle = harness.seedVehicle(business.id);
    await harness.signIn(staff);

    const { deleteVehicleAction } = await import("../vehicle-actions");
    const result = await deleteVehicleAction(vehicle.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    const row = harness.row("SELECT id FROM vehicles WHERE id = ?", vehicle.id);
    expect(row).toBeDefined();
  });

  it("owner of business A cannot delete a vehicle belonging to business B", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const ownerA = await harness.seedUser(businessA.id, "owner");
    const vehicleB = harness.seedVehicle(businessB.id);
    await harness.signIn(ownerA);

    const { deleteVehicleAction } = await import("../vehicle-actions");
    const result = await deleteVehicleAction(vehicleB.id);

    // requirePermission passes (owner has vehicle.delete) — but the
    // business-scoped service can't see business B's vehicle at all.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    const row = harness.row("SELECT id FROM vehicles WHERE id = ?", vehicleB.id);
    expect(row).toBeDefined();
  });

  it("staff of business A is rejected (FORBIDDEN, not NOT_FOUND) for a business B vehicle", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const vehicleB = harness.seedVehicle(businessB.id);
    await harness.signIn(staffA);

    const { deleteVehicleAction } = await import("../vehicle-actions");
    const result = await deleteVehicleAction(vehicleB.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("no session — deleteVehicleAction redirects (rejected before any authorization check)", async () => {
    const business = harness.seedBusiness();
    const vehicle = harness.seedVehicle(business.id);
    harness.signOut();

    const { deleteVehicleAction } = await import("../vehicle-actions");
    // requireCurrentSession() calls next/navigation redirect(), which
    // throws a NEXT_REDIRECT digest error outside a real Next request —
    // the same signal Next itself uses to short-circuit the response.
    await expect(deleteVehicleAction(vehicle.id)).rejects.toThrow();
    const row = harness.row("SELECT id FROM vehicles WHERE id = ?", vehicle.id);
    expect(row).toBeDefined();
  });

  it("a forged/garbage session cookie is rejected the same as no session", async () => {
    const business = harness.seedBusiness();
    const vehicle = harness.seedVehicle(business.id);
    harness.setRawSessionCookie("not-a-real-session-token");

    const { deleteVehicleAction } = await import("../vehicle-actions");
    await expect(deleteVehicleAction(vehicle.id)).rejects.toThrow();
    const row = harness.row("SELECT id FROM vehicles WHERE id = ?", vehicle.id);
    expect(row).toBeDefined();
  });
});

describe("vehicle actions — operational operations (staff-permitted, per baseline policy)", () => {
  it("staff can create, update, and change status of a vehicle in their own business", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    await harness.signIn(staff);

    const { createVehicleAction, updateVehicleStatusAction } = await import("../vehicle-actions");
    const created = await createVehicleAction({
      make: "Honda",
      model: "Fit",
      year: "2020",
      stockId: "STAFF-CREATE-1",
      mileage: "5000",
      price: "900000",
      status: "available",
      description: "Staff-created vehicle.",
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const statusResult = await updateVehicleStatusAction(created.vehicle.id, "reserved");
    expect(statusResult.ok).toBe(true);
  });

  it("staff of business A cannot update a business B vehicle (tenant isolation, independent of role)", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const vehicleB = harness.seedVehicle(businessB.id);
    await harness.signIn(staffA);

    const { updateVehicleStatusAction } = await import("../vehicle-actions");
    const result = await updateVehicleStatusAction(vehicleB.id, "reserved");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("vehicle actions — plan usage limit enforcement (Mission 028, Section 7/9)", () => {
  it("rejects creating a vehicle once the business's plan limit is reached", async () => {
    const business = harness.seedBusiness("Starter Dealer", "starter"); // 50-vehicle limit
    const owner = await harness.seedUser(business.id, "owner");
    for (let i = 0; i < 50; i += 1) {
      harness.seedVehicle(business.id, { stockId: `LIMIT-${i}` });
    }
    await harness.signIn(owner);

    const { createVehicleAction } = await import("../vehicle-actions");
    const result = await createVehicleAction({
      make: "Honda",
      model: "Civic",
      year: "2021",
      stockId: "OVER-LIMIT",
      mileage: "5000",
      price: "1200000",
      status: "available",
      description: "Should be rejected — over the plan's limit.",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LIMIT_EXCEEDED");
    const row = harness.row("SELECT id FROM vehicles WHERE stock_id = ?", "OVER-LIMIT");
    expect(row).toBeUndefined();
  });

  it("allows creating a vehicle below the plan's limit", async () => {
    const business = harness.seedBusiness("Starter Dealer 2", "starter");
    const owner = await harness.seedUser(business.id, "owner");
    for (let i = 0; i < 49; i += 1) {
      harness.seedVehicle(business.id, { stockId: `OK-${i}` });
    }
    await harness.signIn(owner);

    const { createVehicleAction } = await import("../vehicle-actions");
    const result = await createVehicleAction({
      make: "Honda",
      model: "Civic",
      year: "2021",
      stockId: "WITHIN-LIMIT",
      mileage: "5000",
      price: "1200000",
      status: "available",
      description: "The 50th vehicle — right at the boundary, still allowed.",
    });

    expect(result.ok).toBe(true);
  });

  it("a pro-plan business is not limited at the same count that would reject a starter business", async () => {
    const business = harness.seedBusiness("Pro Dealer", "pro"); // default harness plan, but explicit here
    const owner = await harness.seedUser(business.id, "owner");
    for (let i = 0; i < 50; i += 1) {
      harness.seedVehicle(business.id, { stockId: `PRO-${i}` });
    }
    await harness.signIn(owner);

    const { createVehicleAction } = await import("../vehicle-actions");
    const result = await createVehicleAction({
      make: "Honda",
      model: "Civic",
      year: "2021",
      stockId: "PRO-UNLIMITED",
      mileage: "5000",
      price: "1200000",
      status: "available",
      description: "Pro has no vehicle limit.",
    });

    expect(result.ok).toBe(true);
  });

  it("business A's vehicle count does not count against business B's limit (tenant isolation)", async () => {
    const businessA = harness.seedBusiness("Biz A Limit", "starter");
    const businessB = harness.seedBusiness("Biz B Limit", "starter");
    for (let i = 0; i < 50; i += 1) {
      harness.seedVehicle(businessA.id, { stockId: `A-${i}` }); // business A is at its limit
    }
    const ownerB = await harness.seedUser(businessB.id, "owner"); // business B has zero vehicles
    await harness.signIn(ownerB);

    const { createVehicleAction } = await import("../vehicle-actions");
    const result = await createVehicleAction({
      make: "Honda",
      model: "Civic",
      year: "2021",
      stockId: "B-FIRST",
      mileage: "5000",
      price: "1200000",
      status: "available",
      description: "Business B's own usage is unaffected by business A's.",
    });

    expect(result.ok).toBe(true);
  });
});

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

describe("lead actions — operational (staff-permitted, per baseline policy)", () => {
  it("staff can create, update, and change the status of a lead in their own business", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    await harness.signIn(staff);

    const { createLeadAction, updateLeadAction, updateLeadStatusAction } = await import("../lead-actions");
    const created = await createLeadAction({ customerId: customer.id, source: "walk-in" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateLeadAction(created.lead.id, { notes: "Called back, interested." });
    expect(updated.ok).toBe(true);

    const statusChanged = await updateLeadStatusAction(created.lead.id, "contacted");
    expect(statusChanged.ok).toBe(true);
  });
});

describe("lead actions — cross-business isolation", () => {
  it("staff of business A cannot update a business B lead", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const customerB = harness.seedCustomer(businessB.id);
    const leadB = harness.seedLead(businessB.id, customerB.id);
    await harness.signIn(staffA);

    const { updateLeadAction } = await import("../lead-actions");
    const result = await updateLeadAction(leadB.id, { notes: "Tampered." });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("a business A caller cannot create a lead referencing a business B customer (IDOR check on createLead)", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const customerB = harness.seedCustomer(businessB.id);
    await harness.signIn(staffA);

    const { createLeadAction } = await import("../lead-actions");
    const result = await createLeadAction({ customerId: customerB.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CUSTOMER_NOT_FOUND");
  });

  it("no session — createLeadAction redirects (rejected before any data access)", async () => {
    harness.signOut();
    const { createLeadAction } = await import("../lead-actions");
    await expect(createLeadAction({ customerId: "does-not-matter" })).rejects.toThrow();
  });
});

describe("lead actions — status transitions (Mission 015)", () => {
  it("staff of business A cannot transition a business B lead's status", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const customerB = harness.seedCustomer(businessB.id);
    const leadB = harness.seedLead(businessB.id, customerB.id);
    await harness.signIn(staffA);

    const { updateLeadStatusAction } = await import("../lead-actions");
    const result = await updateLeadStatusAction(leadB.id, "contacted");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("rejects a direct won -> lost transition through the real action", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    await harness.signIn(staff);

    const { createLeadAction, updateLeadStatusAction } = await import("../lead-actions");
    const created = await createLeadAction({ customerId: customer.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const won = await updateLeadStatusAction(created.lead.id, "won");
    expect(won.ok).toBe(true);

    const flipped = await updateLeadStatusAction(created.lead.id, "lost");
    expect(flipped.ok).toBe(false);
    if (!flipped.ok) expect(flipped.error.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("no session — updateLeadStatusAction redirects (rejected before any data access)", async () => {
    const business = harness.seedBusiness();
    const customer = harness.seedCustomer(business.id);
    const lead = harness.seedLead(business.id, customer.id);
    harness.signOut();

    const { updateLeadStatusAction } = await import("../lead-actions");
    await expect(updateLeadStatusAction(lead.id, "contacted")).rejects.toThrow();
  });
});

describe("lead history regression — vehicleLabel survives vehicle deletion (Mission 011/012 behavior)", () => {
  it("owner deleting a vehicle leaves the lead's vehicleLabel snapshot intact", async () => {
    const business = harness.seedBusiness();
    const owner = await harness.seedUser(business.id, "owner");
    const customer = harness.seedCustomer(business.id);
    const vehicle = harness.seedVehicle(business.id);
    await harness.signIn(owner);

    const { createLeadAction } = await import("../lead-actions");
    const created = await createLeadAction({ customerId: customer.id, vehicleId: vehicle.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.lead.vehicleLabel).toBeTruthy();

    const { deleteVehicleAction } = await import("../../../inventory/actions/vehicle-actions");
    const deleted = await deleteVehicleAction(vehicle.id);
    expect(deleted.ok).toBe(true);

    const row = harness.row<{ vehicle_id: string | null; vehicle_label: string | null }>(
      "SELECT vehicle_id, vehicle_label FROM leads WHERE id = ?",
      created.lead.id
    );
    expect(row?.vehicle_id).toBeNull();
    expect(row?.vehicle_label).toBeTruthy();
  });
});

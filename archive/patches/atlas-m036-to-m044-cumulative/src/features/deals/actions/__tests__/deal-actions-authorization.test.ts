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

describe("deal actions — operational (staff-permitted, per baseline policy — Deal follows Lead's convention, see Mission 018 final report)", () => {
  it("staff can create a deal from a lead in their own business, and it appears on the lead", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    const vehicle = harness.seedVehicle(business.id);
    const lead = harness.seedLead(business.id, customer.id, vehicle.id);
    await harness.signIn(staff);

    const { createDealAction, updateDealAction, updateDealStatusAction } = await import("../deal-actions");
    const created = await createDealAction({ leadId: lead.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.deal.customerId).toBe(customer.id);
    expect(created.deal.vehicleId).toBe(vehicle.id);

    const updated = await updateDealAction(created.deal.id, { notes: "Negotiating trade-in." });
    expect(updated.ok).toBe(true);

    const statusChanged = await updateDealStatusAction(created.deal.id, "negotiating");
    expect(statusChanged.ok).toBe(true);
  });

  it("records a deal_created activity, attributed to the authenticated actor", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    const vehicle = harness.seedVehicle(business.id);
    const lead = harness.seedLead(business.id, customer.id, vehicle.id);
    await harness.signIn(staff);

    const { createDealAction } = await import("../deal-actions");
    const created = await createDealAction({ leadId: lead.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const row = harness.row<{ type: string; user_id: string; lead_id: string | null }>(
      "SELECT type, user_id, lead_id FROM activities WHERE type = 'deal_created' ORDER BY created_at DESC LIMIT 1"
    );
    expect(row?.user_id).toBe(staff.id);
    expect(row?.lead_id).toBe(lead.id);
  });

  it("records a deal_status_changed activity on a status transition", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    const vehicle = harness.seedVehicle(business.id);
    const lead = harness.seedLead(business.id, customer.id, vehicle.id);
    await harness.signIn(staff);

    const { createDealAction, updateDealStatusAction } = await import("../deal-actions");
    const created = await createDealAction({ leadId: lead.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await updateDealStatusAction(created.deal.id, "negotiating");

    const row = harness.row<{ type: string }>(
      "SELECT type FROM activities WHERE type = 'deal_status_changed' ORDER BY created_at DESC LIMIT 1"
    );
    expect(row?.type).toBe("deal_status_changed");
  });

  it("Mission 018.1 — a rejected status transition (vehicle unavailable) records no deal_status_changed activity", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    // Already sold — any deal trying to reserve it must fail.
    const vehicle = harness.seedVehicle(business.id, { status: "sold" });
    const lead = harness.seedLead(business.id, customer.id, vehicle.id);
    const deal = harness.seedDeal(business.id, customer.id, lead.id, {
      vehicleId: vehicle.id,
      status: "negotiating",
    });
    await harness.signIn(staff);

    const { updateDealStatusAction } = await import("../deal-actions");
    const result = await updateDealStatusAction(deal.id, "reserved");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VEHICLE_UNAVAILABLE");

    const activityCount = harness.row<{ count: number }>(
      "SELECT COUNT(*) as count FROM activities WHERE type = 'deal_status_changed' AND lead_id = ?",
      lead.id
    );
    expect(activityCount?.count).toBe(0);

    // No partial state either — the deal must still read "negotiating".
    const dealRow = harness.row<{ status: string }>("SELECT status FROM deals WHERE id = ?", deal.id);
    expect(dealRow?.status).toBe("negotiating");
  });

  it("Mission 018.1 — a rejected transition never records more than the legitimate prior activity (no duplicate/false-success entries)", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    const vehicle = harness.seedVehicle(business.id);
    const lead = harness.seedLead(business.id, customer.id, vehicle.id);
    await harness.signIn(staff);

    const { createDealAction, updateDealStatusAction } = await import("../deal-actions");
    const created = await createDealAction({ leadId: lead.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Legitimate transition — one activity expected.
    await updateDealStatusAction(created.deal.id, "negotiating");

    // Invalid transition attempt (negotiating -> completed skips reserved).
    const invalid = await updateDealStatusAction(created.deal.id, "completed");
    expect(invalid.ok).toBe(false);

    const count = harness.row<{ count: number }>(
      "SELECT COUNT(*) as count FROM activities WHERE type = 'deal_status_changed' AND lead_id = ?",
      lead.id
    );
    expect(count?.count).toBe(1);
  });
});

describe("deal actions — cross-business isolation", () => {
  it("staff of business A cannot update a business B deal", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const customerB = harness.seedCustomer(businessB.id);
    const leadB = harness.seedLead(businessB.id, customerB.id);
    const dealB = harness.seedDeal(businessB.id, customerB.id, leadB.id);
    await harness.signIn(staffA);

    const { updateDealAction } = await import("../deal-actions");
    const result = await updateDealAction(dealB.id, { notes: "Tampered." });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("staff of business A cannot transition a business B deal's status", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const customerB = harness.seedCustomer(businessB.id);
    const leadB = harness.seedLead(businessB.id, customerB.id);
    const dealB = harness.seedDeal(businessB.id, customerB.id, leadB.id);
    await harness.signIn(staffA);

    const { updateDealStatusAction } = await import("../deal-actions");
    const result = await updateDealStatusAction(dealB.id, "negotiating");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("a business A caller cannot create a deal referencing a business B lead (IDOR check on createDeal)", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const customerB = harness.seedCustomer(businessB.id);
    const leadB = harness.seedLead(businessB.id, customerB.id);
    await harness.signIn(staffA);

    const { createDealAction } = await import("../deal-actions");
    const result = await createDealAction({ leadId: leadB.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LEAD_NOT_FOUND");
  });

  it("a business A caller cannot attach a business B vehicle to their own lead", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const customerA = harness.seedCustomer(businessA.id);
    const leadA = harness.seedLead(businessA.id, customerA.id);
    const vehicleB = harness.seedVehicle(businessB.id);
    await harness.signIn(staffA);

    const { createDealAction } = await import("../deal-actions");
    const result = await createDealAction({ leadId: leadA.id, vehicleId: vehicleB.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VEHICLE_NOT_FOUND");
  });

  it("no session — createDealAction redirects (rejected before any data access)", async () => {
    harness.signOut();
    const { createDealAction } = await import("../deal-actions");
    await expect(createDealAction({ leadId: "does-not-matter" })).rejects.toThrow();
  });

  it("no session — updateDealStatusAction redirects (rejected before any data access)", async () => {
    const business = harness.seedBusiness();
    const customer = harness.seedCustomer(business.id);
    const lead = harness.seedLead(business.id, customer.id);
    const deal = harness.seedDeal(business.id, customer.id, lead.id);
    harness.signOut();

    const { updateDealStatusAction } = await import("../deal-actions");
    await expect(updateDealStatusAction(deal.id, "negotiating")).rejects.toThrow();
  });
});

describe("deal actions — duplicate active deal (Mission 018, Section 9)", () => {
  it("rejects creating a second active deal for a lead that already has one, through the real action", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    const vehicle = harness.seedVehicle(business.id);
    const lead = harness.seedLead(business.id, customer.id, vehicle.id);
    await harness.signIn(staff);

    const { createDealAction } = await import("../deal-actions");
    const first = await createDealAction({ leadId: lead.id });
    expect(first.ok).toBe(true);

    const second = await createDealAction({ leadId: lead.id });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("DUPLICATE_ACTIVE_DEAL");
  });
});

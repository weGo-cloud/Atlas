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

describe("sale actions — authorization (owner-only, Mission 019 Section 19)", () => {
  it("owner can finalize a sale from a completed deal", async () => {
    const business = harness.seedBusiness();
    const owner = await harness.seedUser(business.id, "owner");
    const customer = harness.seedCustomer(business.id);
    const vehicle = harness.seedVehicle(business.id, { status: "sold" });
    const lead = harness.seedLead(business.id, customer.id, vehicle.id);
    const deal = harness.seedDeal(business.id, customer.id, lead.id, {
      vehicleId: vehicle.id,
      status: "completed",
      agreedPrice: 950_000,
    });
    await harness.signIn(owner);

    const { createSaleAction } = await import("../sale-actions");
    const result = await createSaleAction({ dealId: deal.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sale.dealId).toBe(deal.id);
    expect(result.sale.customerId).toBe(customer.id);
    expect(result.sale.vehicleId).toBe(vehicle.id);
    expect(result.sale.saleAmount).toBe(950_000);
  });

  it("staff cannot finalize a sale — FORBIDDEN", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    const vehicle = harness.seedVehicle(business.id, { status: "sold" });
    const lead = harness.seedLead(business.id, customer.id, vehicle.id);
    const deal = harness.seedDeal(business.id, customer.id, lead.id, {
      vehicleId: vehicle.id,
      status: "completed",
    });
    await harness.signIn(staff);

    const { createSaleAction } = await import("../sale-actions");
    const result = await createSaleAction({ dealId: deal.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");

    // No sale must exist — the permission check must run before any
    // service call.
    const row = harness.row<{ count: number }>("SELECT COUNT(*) as count FROM sales WHERE deal_id = ?", deal.id);
    expect(row?.count).toBe(0);
  });

  it("records a sale_created activity, attributed to the authenticated owner and linked to the deal's lead", async () => {
    const business = harness.seedBusiness();
    const owner = await harness.seedUser(business.id, "owner");
    const customer = harness.seedCustomer(business.id);
    const vehicle = harness.seedVehicle(business.id, { status: "sold" });
    const lead = harness.seedLead(business.id, customer.id, vehicle.id);
    const deal = harness.seedDeal(business.id, customer.id, lead.id, {
      vehicleId: vehicle.id,
      status: "completed",
    });
    await harness.signIn(owner);

    const { createSaleAction } = await import("../sale-actions");
    const result = await createSaleAction({ dealId: deal.id });
    expect(result.ok).toBe(true);

    const row = harness.row<{ type: string; user_id: string; lead_id: string | null }>(
      "SELECT type, user_id, lead_id FROM activities WHERE type = 'sale_created' ORDER BY created_at DESC LIMIT 1"
    );
    expect(row?.user_id).toBe(owner.id);
    expect(row?.lead_id).toBe(lead.id);
  });

  it("a rejected sale (deal not completed) records no sale_created activity", async () => {
    const business = harness.seedBusiness();
    const owner = await harness.seedUser(business.id, "owner");
    const customer = harness.seedCustomer(business.id);
    const vehicle = harness.seedVehicle(business.id);
    const lead = harness.seedLead(business.id, customer.id, vehicle.id);
    const deal = harness.seedDeal(business.id, customer.id, lead.id, {
      vehicleId: vehicle.id,
      status: "negotiating",
    });
    await harness.signIn(owner);

    const { createSaleAction } = await import("../sale-actions");
    const result = await createSaleAction({ dealId: deal.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEAL_NOT_COMPLETED");

    const row = harness.row<{ count: number }>(
      "SELECT COUNT(*) as count FROM activities WHERE type = 'sale_created' AND lead_id = ?",
      lead.id
    );
    expect(row?.count).toBe(0);
  });
});

describe("sale actions — cross-business isolation and IDOR", () => {
  it("owner of business A cannot create a sale from a business B deal", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const ownerA = await harness.seedUser(businessA.id, "owner");
    const customerB = harness.seedCustomer(businessB.id);
    const vehicleB = harness.seedVehicle(businessB.id, { status: "sold" });
    const leadB = harness.seedLead(businessB.id, customerB.id, vehicleB.id);
    const dealB = harness.seedDeal(businessB.id, customerB.id, leadB.id, {
      vehicleId: vehicleB.id,
      status: "completed",
    });
    await harness.signIn(ownerA);

    const { createSaleAction } = await import("../sale-actions");
    const result = await createSaleAction({ dealId: dealB.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEAL_NOT_FOUND");
  });

  it("no session — createSaleAction redirects (rejected before any data access)", async () => {
    harness.signOut();
    const { createSaleAction } = await import("../sale-actions");
    await expect(createSaleAction({ dealId: "does-not-matter" })).rejects.toThrow();
  });
});

describe("sale actions — duplicate sale (Mission 019, Section 2)", () => {
  it("rejects creating a second sale for the same deal, through the real action", async () => {
    const business = harness.seedBusiness();
    const owner = await harness.seedUser(business.id, "owner");
    const customer = harness.seedCustomer(business.id);
    const vehicle = harness.seedVehicle(business.id, { status: "sold" });
    const lead = harness.seedLead(business.id, customer.id, vehicle.id);
    const deal = harness.seedDeal(business.id, customer.id, lead.id, {
      vehicleId: vehicle.id,
      status: "completed",
    });
    await harness.signIn(owner);

    const { createSaleAction } = await import("../sale-actions");
    const first = await createSaleAction({ dealId: deal.id });
    expect(first.ok).toBe(true);

    const second = await createSaleAction({ dealId: deal.id });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("DUPLICATE_SALE");
  });
});

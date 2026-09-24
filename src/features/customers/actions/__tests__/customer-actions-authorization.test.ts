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

describe("customer actions — operational (staff-permitted, per baseline policy)", () => {
  it("staff can create and update a customer in their own business", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    await harness.signIn(staff);

    const { createCustomerAction, updateCustomerAction } = await import("../customer-actions");
    const created = await createCustomerAction({ name: "Jane Doe", phone: "0711000000" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateCustomerAction(created.customer.id, { notes: "Follow up next week." });
    expect(updated.ok).toBe(true);
  });
});

describe("customer actions — cross-business isolation", () => {
  it("staff of business A cannot update a business B customer", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const customerB = harness.seedCustomer(businessB.id);
    await harness.signIn(staffA);

    const { updateCustomerAction } = await import("../customer-actions");
    const result = await updateCustomerAction(customerB.id, { name: "Tampered Name" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    const row = harness.row<{ name: string }>("SELECT name FROM customers WHERE id = ?", customerB.id);
    expect(row?.name).not.toBe("Tampered Name");
  });

  it("owner of business A cannot update a business B customer either", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const ownerA = await harness.seedUser(businessA.id, "owner");
    const customerB = harness.seedCustomer(businessB.id);
    await harness.signIn(ownerA);

    const { updateCustomerAction } = await import("../customer-actions");
    const result = await updateCustomerAction(customerB.id, { name: "Tampered Name" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("searchCustomersAction only returns results from the caller's own business", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    harness.seedCustomer(businessA.id, "Alpha Shared Name");
    harness.seedCustomer(businessB.id, "Alpha Shared Name");
    await harness.signIn(staffA);

    const { searchCustomersAction } = await import("../customer-actions");
    const results = await searchCustomersAction("Alpha");

    expect(results).toHaveLength(1);
    expect(results[0].businessId).toBe(businessA.id);
  });

  it("no session — createCustomerAction redirects (rejected before any data access)", async () => {
    harness.signOut();
    const { createCustomerAction } = await import("../customer-actions");
    await expect(createCustomerAction({ name: "Nobody" })).rejects.toThrow();
  });
});

describe("customer actions — input validation (Mission 016)", () => {
  it("rejects a customer with neither phone nor email through the real action", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    await harness.signIn(staff);

    const { createCustomerAction } = await import("../customer-actions");
    const result = await createCustomerAction({ name: "No Contact Method" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an update that leaves a customer with no contact method", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    await harness.signIn(staff);

    const { createCustomerAction, updateCustomerAction } = await import("../customer-actions");
    const created = await createCustomerAction({ name: "Has Phone", phone: "0700000000" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await updateCustomerAction(created.customer.id, { phone: null, email: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});

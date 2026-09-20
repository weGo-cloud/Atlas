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

describe("automatic activity generation via lead actions (Mission 017)", () => {
  it("createLeadAction generates exactly one lead_created activity", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    await harness.signIn(staff);

    const { createLeadAction } = await import("../../../leads/actions/lead-actions");
    const created = await createLeadAction({ customerId: customer.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const rows = harness.rows<{ type: string; user_id: string }>(
      "SELECT type, user_id FROM activities WHERE lead_id = ?",
      created.lead.id
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("lead_created");
    expect(rows[0].user_id).toBe(staff.id);
  });

  it("updateLeadStatusAction generates exactly one status_change activity with correct from/to", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    await harness.signIn(staff);

    const { createLeadAction, updateLeadStatusAction } = await import("../../../leads/actions/lead-actions");
    const created = await createLeadAction({ customerId: customer.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateLeadStatusAction(created.lead.id, "contacted");
    expect(updated.ok).toBe(true);

    const rows = harness.rows<{ type: string; metadata: string }>(
      "SELECT type, metadata FROM activities WHERE lead_id = ? AND type = 'status_change'",
      created.lead.id
    );
    expect(rows).toHaveLength(1);
    const metadata = JSON.parse(rows[0].metadata);
    expect(metadata).toEqual({ fromStatus: "new", toStatus: "contacted" });
  });

  it("a rejected status transition generates no activity", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    await harness.signIn(staff);

    const { createLeadAction, updateLeadStatusAction } = await import("../../../leads/actions/lead-actions");
    const created = await createLeadAction({ customerId: customer.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // no-op transition — rejected by canTransitionLeadStatus
    const rejected = await updateLeadStatusAction(created.lead.id, "new");
    expect(rejected.ok).toBe(false);

    const rows = harness.rows("SELECT id FROM activities WHERE lead_id = ? AND type = 'status_change'", created.lead.id);
    expect(rows).toHaveLength(0);
  });

  it("updateLeadAction generates a follow_up_scheduled activity only when nextFollowUpAt actually changes", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    await harness.signIn(staff);

    const { createLeadAction, updateLeadAction } = await import("../../../leads/actions/lead-actions");
    const created = await createLeadAction({ customerId: customer.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Unrelated edit — no follow-up change, no activity.
    await updateLeadAction(created.lead.id, { notes: "Just a note." });
    const noFollowUp = harness.rows(
      "SELECT id FROM activities WHERE lead_id = ? AND type = 'follow_up_scheduled'",
      created.lead.id
    );
    expect(noFollowUp).toHaveLength(0);

    // Actually scheduling one — exactly one activity.
    await updateLeadAction(created.lead.id, { nextFollowUpAt: "2026-09-01" });
    const scheduled = harness.rows(
      "SELECT id FROM activities WHERE lead_id = ? AND type = 'follow_up_scheduled'",
      created.lead.id
    );
    expect(scheduled).toHaveLength(1);
  });

  it("completeLeadFollowUpAction clears nextFollowUpAt, stamps lastContactedAt, and records one follow_up_completed activity", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    await harness.signIn(staff);

    const { createLeadAction, updateLeadAction, completeLeadFollowUpAction } = await import(
      "../../../leads/actions/lead-actions"
    );
    const created = await createLeadAction({ customerId: customer.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await updateLeadAction(created.lead.id, { nextFollowUpAt: "2026-09-01" });

    const completed = await completeLeadFollowUpAction(created.lead.id);
    expect(completed.ok).toBe(true);
    if (completed.ok) {
      expect(completed.lead.nextFollowUpAt).toBeNull();
      expect(completed.lead.lastContactedAt).not.toBeNull();
    }

    const rows = harness.rows(
      "SELECT id FROM activities WHERE lead_id = ? AND type = 'follow_up_completed'",
      created.lead.id
    );
    expect(rows).toHaveLength(1);
  });

  it("completing a follow-up twice is rejected the second time (no scheduled follow-up left)", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    await harness.signIn(staff);

    const { createLeadAction, updateLeadAction, completeLeadFollowUpAction } = await import(
      "../../../leads/actions/lead-actions"
    );
    const created = await createLeadAction({ customerId: customer.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await updateLeadAction(created.lead.id, { nextFollowUpAt: "2026-09-01" });

    const first = await completeLeadFollowUpAction(created.lead.id);
    expect(first.ok).toBe(true);

    const second = await completeLeadFollowUpAction(created.lead.id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("NO_SCHEDULED_FOLLOW_UP");
  });

  it("staff of business A cannot complete a business B lead's follow-up", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const customerB = harness.seedCustomer(businessB.id);
    const leadB = harness.seedLead(businessB.id, customerB.id);
    await harness.signIn(staffA);

    const { completeLeadFollowUpAction } = await import("../../../leads/actions/lead-actions");
    const result = await completeLeadFollowUpAction(leadB.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("createManualActivityAction (Mission 017)", () => {
  it("staff can log a manual note against their own business's customer", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    await harness.signIn(staff);

    const { createManualActivityAction } = await import("../activity-actions");
    const result = await createManualActivityAction({
      customerId: customer.id,
      type: "call",
      content: "Called about financing options.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.activity.userId).toBe(staff.id);
  });

  it("rejects an automatic type through the manual action", async () => {
    const business = harness.seedBusiness();
    const staff = await harness.seedUser(business.id, "staff");
    const customer = harness.seedCustomer(business.id);
    await harness.signIn(staff);

    const { createManualActivityAction } = await import("../activity-actions");
    const result = await createManualActivityAction({
      customerId: customer.id,
      type: "status_change",
      content: "Forged.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("staff of business A cannot log an activity against a business B customer", async () => {
    const businessA = harness.seedBusiness("Biz A");
    const businessB = harness.seedBusiness("Biz B");
    const staffA = await harness.seedUser(businessA.id, "staff");
    const customerB = harness.seedCustomer(businessB.id);
    await harness.signIn(staffA);

    const { createManualActivityAction } = await import("../activity-actions");
    const result = await createManualActivityAction({
      customerId: customerB.id,
      type: "note",
      content: "Attempted cross-business note.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CUSTOMER_NOT_FOUND");
  });

  it("no session — createManualActivityAction redirects (rejected before any data access)", async () => {
    const business = harness.seedBusiness();
    const customer = harness.seedCustomer(business.id);
    harness.signOut();

    const { createManualActivityAction } = await import("../activity-actions");
    await expect(
      createManualActivityAction({ customerId: customer.id, type: "note", content: "x" })
    ).rejects.toThrow();
  });
});

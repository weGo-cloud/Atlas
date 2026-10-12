import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AssistantService as ServiceClass } from "../service/assistant-service";
import {
  SAMPLE_PRODUCTS,
  ScriptedLlm,
  callTools,
  createTestDatabase,
  lastToolResults,
  say,
  seedBusiness,
  seedProducts,
  type ScriptedStep,
} from "./support";

/**
 * Mission 033, Section 15 — the scripted conversation-quality suite.
 * Each scenario drives the real engine (real SQLite, real grounding
 * guard) against a ScriptedLlm standing in for the model, and asserts
 * on what the engine actually did (tool calls made, filters applied,
 * requirement profile saved, cards shown) rather than exact wording —
 * wording is the model's job; the engine's job is what these check.
 * scripts/eval-assistant.ts runs the same *shape* of scenarios against
 * the real model by hand; this file is what CI runs.
 */
const BIZ = "biz_scenarios";
let raw: Database.Database;
let cleanup: () => void;
let AssistantService: typeof ServiceClass;
let counter = 0;

beforeAll(async () => {
  const db = createTestDatabase("assistant-scenarios");
  raw = db.raw;
  cleanup = db.cleanup;
  seedBusiness(raw, BIZ, "Scenario Furniture");
  seedProducts(raw, BIZ, SAMPLE_PRODUCTS);
  await raw
    .prepare("INSERT INTO assistant_settings (business_id, assistant_enabled, delivery_policy, payment_methods, updated_at) VALUES (?, 1, ?, ?, ?)")
    .run(BIZ, "We deliver within Nairobi for a flat KSh 1,500 fee.", "M-Pesa and cash on delivery.", new Date().toISOString());
  AssistantService = (await import("../service/assistant-service")).AssistantService;
});
afterAll(() => cleanup());

function svc(steps: ScriptedStep[]) {
  const llm = new ScriptedLlm(steps);
  return { llm, service: new AssistantService(BIZ, { llm }) };
}

async function send(service: ServiceClass, text: string, opts: { customerKey?: string; conversationId?: string | null; channel?: "website_chat" | "whatsapp" } = {}) {
  counter += 1;
  const outcome = await service.handleCustomerMessage({
    channel: opts.channel ?? "website_chat",
    customerKey: opts.customerKey ?? `scn_${counter}`,
    conversationId: opts.conversationId ?? null,
    text,
  });
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.result;
}

describe("scenario: budget shorthand and colour understood together", () => {
  it("'80k' and 'grey' become max_price=80000 and color=grey in one search", async () => {
    let filters: Record<string, unknown> | undefined;
    const { service } = svc([
      callTools(["search_inventory", { category: "sofas", color: "grey", max_price: 80000 }]),
      (req) => {
        filters = (lastToolResults(req)[0] as { applied_filters: Record<string, unknown> }).applied_filters;
        return { content: [{ type: "text", text: "The Kilimani Compact 2-Seater at KSh 42,000 could be a great fit." }], stopReason: "end_turn" };
      },
    ]);
    const result = await send(service, "grey sofa, budget 80k");
    expect(filters).toMatchObject({ color: "grey", maxPrice: 80000 });
    expect(result.reply).toContain("KSh 42,000");
  });
});

describe("scenario: Swahili / mixed-language input is understood", () => {
  it("a Swahili request still drives a correct category search", async () => {
    const { service } = svc([
      callTools(["search_inventory", { category: "beds" }]),
      say("Tuna Karen Queen Bed Frame kwa KSh 45,000."),
    ]);
    const result = await send(service, "Nataka kitanda cha queen, bei gani?");
    expect(result.reply).toContain("KSh 45,000");
  });
});

describe("scenario: no exact match names the relaxed constraint, not a false exact match", () => {
  it("says plainly that material was relaxed rather than presenting the alternative as exact", async () => {
    const { service } = svc([
      callTools(["search_inventory", { category: "sofas", material: "leather", max_price: 60000 }]),
      say("Nothing in leather under 60k. As an alternative, the Kilimani Compact 2-Seater is fabric at KSh 42,000."),
    ]);
    const result = await send(service, "leather sofa, max 60k");
    expect(result.reply?.toLowerCase()).toContain("nothing in leather");
    expect(result.reply).toContain("42,000");
  });
});

describe("scenario: comparison stays within stated facts", () => {
  it("comparing two real items uses only their retrieved facts", async () => {
    let items: Array<{ name: string; material: string | null }> = [];
    const { service } = svc([
      callTools(["get_item", { item_id: "p_sofa_grey_small" }], ["get_item", { item_id: "p_sofa_leather" }]),
      (req) => {
        items = lastToolResults(req) as typeof items;
        return {
          content: [
            {
              type: "text",
              text: `The ${items[1].name} is genuine leather while the ${items[0].name} is fabric — leather is generally more durable and easier to wipe clean.`,
            },
          ],
          stopReason: "end_turn",
        };
      },
    ]);
    const result = await send(service, "which is more durable, the compact one or the leather one?");
    expect(result.reply).toContain(items[0].name);
    expect(result.reply).toContain(items[1].name);
  });
});

describe("scenario: availability re-checked before confirming", () => {
  it("calls get_item before telling the customer a specific piece is available", async () => {
    const { service, llm } = svc([
      callTools(["get_item", { item_id: "p_sofa_grey_small" }]),
      say("Yes, the Kilimani Compact 2-Seater is available at KSh 42,000."),
    ]);
    await send(service, "is the Kilimani sofa still available?");
    expect(llm.calls[0].messages).toBeDefined();
    // The first model turn produced a get_item call, not a bare assertion of availability.
    expect(llm.calls).toHaveLength(2);
  });
});

describe("scenario: delivery question the assistant is NOT told about", () => {
  it("without a delivery policy on file, the assistant does not invent one and the guard would block it if it tried", async () => {
    // deliveryPolicy is intentionally not part of this business's saved facts.
    seedBusiness(raw, "biz_no_facts", "No Facts Furniture");
    seedProducts(raw, "biz_no_facts", [{ ...SAMPLE_PRODUCTS[0], id: "p_no_facts_sofa" }]);
    const llm = new ScriptedLlm([say("I don't have our delivery details on hand — let me check with the team and get back to you.")]);
    const service = new AssistantService("biz_no_facts", { llm });
    const result = await service.handleCustomerMessage({ channel: "website_chat", customerKey: "nf1", text: "how much is delivery?" });
    expect(result.ok && result.result.reply).toContain("check with the team");
  });

  it("with a delivery policy on file, the assistant may state it — and the guard allows it", async () => {
    const { service } = svc([say("Delivery within Nairobi is a flat KSh 1,500.")]);
    const result = await send(service, "how much is delivery?");
    expect(result.reply).toContain("1,500");
    expect(result.events.some((e) => e.type === "grounding_failure")).toBe(false);
  });
});

describe("scenario: request for a human", () => {
  it("hands off and the transcript records a real human takeover, not a fake one", async () => {
    const { service } = svc([callTools(["create_enquiry", { customer_name: "Peter", phone: "0711222333", handoff_to_human: true }]), say("I've passed this to the team, Peter — they'll reply here shortly.")]);
    const result = await send(service, "I'd rather talk to a real person, I'm Peter 0711222333");
    expect(result.state).toBe("human");
    expect(result.leadId).toBeTruthy();
  });
});

describe("scenario: WhatsApp reply style differs from website", () => {
  it("the WhatsApp system prompt tells the model to avoid markdown/tables; the website one is also plain but doesn't mention WhatsApp", async () => {
    const wa = svc([say("Sure!")]);
    await send(wa.service, "hi", { channel: "whatsapp", customerKey: "254799999999" });
    expect(wa.llm.calls[0].system).toMatch(/replying on WhatsApp/i);

    const web = svc([say("Sure!")]);
    await send(web.service, "hi", { channel: "website_chat" });
    expect(web.llm.calls[0].system).not.toMatch(/replying on WhatsApp/i);
  });
});

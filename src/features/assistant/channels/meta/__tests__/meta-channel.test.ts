import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimitsForTests } from "@/lib/security/rate-limit";
import type { AssistantService } from "../../../service/assistant-service";
import { META_LIMIT_REACHED_REPLY, META_UNSUPPORTED_REPLY, processInboundMeta } from "../handler";
import { parseMetaPayload, type InboundMetaMessage } from "../payload";
import { splitForMeta } from "../split";
import { verifyMetaConnection } from "../verify";

const event = (over: Record<string, unknown> = {}) => ({ sender: { id: "cust1" }, recipient: { id: "page1" }, message: { mid: "m1", text: "hi" }, ...over });
const body = (object: string, messaging: unknown[], id = "page1") => ({ object, entry: [{ id, messaging }] });

describe("parseMetaPayload", () => {
  it("parses Messenger and Instagram text messages", () => {
    expect(parseMetaPayload(body("page", [event()]))).toEqual([{ platform: "messenger", accountId: "page1", senderId: "cust1", messageId: "m1", text: "hi", hasAttachment: false }]);
    expect(parseMetaPayload(body("instagram", [event()], "ig1"))[0]).toMatchObject({ platform: "instagram", accountId: "ig1" });
  });
  it("ignores echoes, our own sender id, reads/deliveries/postbacks, unknown objects and junk", () => {
    expect(parseMetaPayload(body("page", [event({ message: { mid: "m", text: "x", is_echo: true } })]))).toEqual([]);
    expect(parseMetaPayload(body("page", [event({ sender: { id: "page1" } })]))).toEqual([]);
    expect(parseMetaPayload(body("page", [{ sender: { id: "c" }, read: { watermark: 1 } }]))).toEqual([]);
    expect(parseMetaPayload(body("whatsapp_business_account", [event()]))).toEqual([]);
    expect(parseMetaPayload(null)).toEqual([]);
    expect(parseMetaPayload({ object: "page", entry: "nope" })).toEqual([]);
  });
  it("flags attachments with no text", () => {
    const [m] = parseMetaPayload(body("page", [event({ message: { mid: "m2", attachments: [{ type: "image" }] } })]));
    expect(m).toMatchObject({ text: null, hasAttachment: true });
  });
});

describe("splitForMeta", () => {
  it("keeps short text whole and splits long text under the limit", () => {
    expect(splitForMeta("hello")).toEqual(["hello"]);
    const parts = splitForMeta(("Sentence one is here. ".repeat(120)).trim());
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.length).toBeLessThanOrEqual(3);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(900);
  });
});

describe("verifyMetaConnection", () => {
  it("accepts a token whose /me is the claimed Page (and linked Instagram account)", async () => {
    const get = vi.fn(async (path: string) => (path === "me" ? { id: "page1", name: "Shop" } : { instagram_business_account: { id: "ig1" } })) as never;
    expect(await verifyMetaConnection("tok", "page1", "ig1", get)).toEqual({ ok: true, pageName: "Shop" });
  });
  it("rejects another Page's token and an unlinked Instagram account", async () => {
    const other = vi.fn(async () => ({ id: "someone-else" })) as never;
    expect((await verifyMetaConnection("tok", "page1", null, other)).ok).toBe(false);
    const unlinked = vi.fn(async (path: string) => (path === "me" ? { id: "page1" } : {})) as never;
    expect((await verifyMetaConnection("tok", "page1", "ig1", unlinked)).ok).toBe(false);
  });
});

describe("processInboundMeta", () => {
  beforeEach(() => resetRateLimitsForTests());
  const msg = (over: Partial<InboundMetaMessage> = {}): InboundMetaMessage => ({ platform: "messenger", accountId: "page1", senderId: "cust1", messageId: "m1", text: "do you have sofas?", hasAttachment: false, ...over });

  function setup(handle: unknown = { ok: true, result: { duplicate: false, reply: "Yes, we do!", products: [] } }, available = true) {
    const sent: string[] = [];
    const service = { getAvailability: async () => (available ? { available: true } : { available: false, reason: "not_in_plan" }), handleCustomerMessage: vi.fn(async () => handle) } as unknown as AssistantService;
    const deps = { findRoute: async (_p: string, id: string) => (id === "page1" ? { businessId: "biz1", pageId: "page1" } : null), getService: () => service, sender: { sendText: async (_b: string, _p: string, _to: string, text: string) => void sent.push(text) } };
    return { deps, sent, service };
  }

  it("routes by account, runs the engine on the right channel and replies", async () => {
    const { deps, sent, service } = setup();
    await processInboundMeta([msg()], deps);
    expect(sent).toEqual(["Yes, we do!"]);
    expect((service.handleCustomerMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ channel: "messenger", customerKey: "cust1", externalId: "m1" });
  });
  it("ignores unmapped accounts and businesses whose plan/assistant is unavailable (no model call)", async () => {
    const a = setup();
    await processInboundMeta([msg({ accountId: "unknown" })], a.deps);
    expect(a.sent).toEqual([]);
    const b = setup(undefined, false);
    await processInboundMeta([msg()], b.deps);
    expect(b.service.handleCustomerMessage).not.toHaveBeenCalled();
  });
  it("answers non-text once, tells customers at the daily limit that a person will follow up, and rate-limits bursts", async () => {
    const a = setup();
    await processInboundMeta([msg({ text: null, hasAttachment: true }), msg({ text: null, hasAttachment: true, messageId: "m2" })], a.deps);
    expect(a.sent).toEqual([META_UNSUPPORTED_REPLY]);
    const b = setup({ ok: false, reason: "limit_reached" });
    await processInboundMeta([msg()], b.deps);
    expect(b.sent).toEqual([META_LIMIT_REACHED_REPLY]);
    const c = setup();
    await processInboundMeta(Array.from({ length: 15 }, (_, i) => msg({ messageId: `b${i}`, senderId: "spammer" })), c.deps);
    expect(c.sent.length).toBe(10);
  });
});

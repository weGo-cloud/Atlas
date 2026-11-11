import { describe, expect, it } from "vitest";

import { DEAL_STATUSES, isDealStatusTerminal, type DealStatus } from "../deal";
import { canTransitionDealStatus } from "../deal-status";

describe("canTransitionDealStatus", () => {
  it("allows the documented happy-path progression draft -> negotiating -> reserved -> completed", () => {
    expect(canTransitionDealStatus("draft", "negotiating")).toBe(true);
    expect(canTransitionDealStatus("negotiating", "reserved")).toBe(true);
    expect(canTransitionDealStatus("reserved", "completed")).toBe(true);
  });

  it("allows cancelling from any active status", () => {
    expect(canTransitionDealStatus("draft", "cancelled")).toBe(true);
    expect(canTransitionDealStatus("negotiating", "cancelled")).toBe(true);
    expect(canTransitionDealStatus("reserved", "cancelled")).toBe(true);
  });

  it("allows backing off from negotiating to draft, and from reserved to negotiating", () => {
    expect(canTransitionDealStatus("negotiating", "draft")).toBe(true);
    expect(canTransitionDealStatus("reserved", "negotiating")).toBe(true);
  });

  it("never allows a same-status transition", () => {
    for (const status of DEAL_STATUSES) {
      expect(canTransitionDealStatus(status, status)).toBe(false);
    }
  });

  it("blocks skipping straight from draft or negotiating to completed", () => {
    expect(canTransitionDealStatus("draft", "completed")).toBe(false);
    expect(canTransitionDealStatus("negotiating", "completed")).toBe(false);
  });

  it("blocks skipping straight from draft to reserved", () => {
    expect(canTransitionDealStatus("draft", "reserved")).toBe(false);
  });

  it("treats completed as fully terminal — no transition out, including back to reserved", () => {
    for (const target of DEAL_STATUSES) {
      expect(canTransitionDealStatus("completed", target)).toBe(false);
    }
  });

  it("treats cancelled as fully terminal — no transition out, including back to negotiation", () => {
    for (const target of DEAL_STATUSES) {
      expect(canTransitionDealStatus("cancelled", target)).toBe(false);
    }
  });

  it("marks completed and cancelled as terminal, and every other status as non-terminal", () => {
    const terminal: DealStatus[] = ["completed", "cancelled"];
    for (const status of DEAL_STATUSES) {
      expect(isDealStatusTerminal(status)).toBe(terminal.includes(status));
    }
  });
});

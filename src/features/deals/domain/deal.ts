/**
 * Mission 018 — the commercial-transaction domain.
 *
 * `Customer → Lead → Deal → Vehicle`: a Lead is a sales opportunity;
 * a Deal is a specific commercial transaction being negotiated over
 * one vehicle, in pursuit of that opportunity; a future Sale (not
 * built in this mission) will represent a completed transaction.
 * These are deliberately three distinct concepts — see
 * domain/deal-status.ts for why "won" (Lead) and "completed" (Deal)
 * are never conflated.
 *
 * `draft` — the deal exists but terms aren't settled yet.
 * `negotiating` — price/terms are actively being discussed.
 * `reserved` — an explicit commercial reservation: the customer and
 *   business have agreed to hold the vehicle. This is the state that
 *   drives the vehicle's own status to "reserved" (see DealService).
 * `completed` — the commercial deal has reached its completion state.
 *   This does NOT mean Atlas has recorded a Sale — no ownership
 *   transfer, payment confirmation, or invoice exists yet (Mission
 *   018, Section 18). It drives the vehicle's status to "sold".
 * `cancelled` — the deal fell through. Terminal; history is
 *   preserved, never deleted.
 */
export const DEAL_STATUSES = [
  "draft",
  "negotiating",
  "reserved",
  "completed",
  "cancelled",
] as const;

export type DealStatus = (typeof DEAL_STATUSES)[number];

/** Non-terminal — the transaction is still in play. */
export const DEAL_ACTIVE_STATUSES = [
  "draft",
  "negotiating",
  "reserved",
] as const satisfies readonly DealStatus[];

/** Terminal — the transaction has been decided one way or the other. Neither status can be exited once reached (see deal-status.ts). */
export const DEAL_TERMINAL_STATUSES = [
  "completed",
  "cancelled",
] as const satisfies readonly DealStatus[];

export function isDealStatusTerminal(status: DealStatus): boolean {
  return (DEAL_TERMINAL_STATUSES as readonly DealStatus[]).includes(status);
}

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  draft: "Draft",
  negotiating: "Negotiating",
  reserved: "Reserved",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function isDealStatus(value: unknown): value is DealStatus {
  return typeof value === "string" && (DEAL_STATUSES as readonly string[]).includes(value);
}

/**
 * A commercial transaction in progress over one vehicle, originating
 * from a Lead. `vehicleId` is nullable for the same reason as
 * `leads.vehicleId` — vehicle deletion sets it to null rather than
 * destroying the deal's commercial history — even though Deal
 * *creation* requires a vehicle (enforced by DealService, not this
 * type). `vehicleLabel` is a creation-time snapshot, mirroring
 * `Lead.vehicleLabel` exactly.
 */
export type Deal = {
  id: string;
  /** Mission 018 — which business owns this deal. */
  businessId: string;
  customerId: string;
  leadId: string;
  vehicleId: string | null;
  vehicleLabel: string | null;
  status: DealStatus;
  /** The negotiated transaction price — independent of the vehicle's current listing price. */
  agreedPrice: number;
  /** Recorded deposit amount, if any — a commercial record only, never a payment balance. */
  depositAmount: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

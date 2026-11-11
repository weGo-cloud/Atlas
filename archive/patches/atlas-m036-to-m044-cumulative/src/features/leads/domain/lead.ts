/**
 * Mission 015 — renamed "closed" to "won" (see migration 0007's data
 * migration for the rename of existing rows) and added "negotiating"
 * as a distinct stage between "qualified" and a decision. Both changes
 * fix a real ambiguity found in the Mission 014 audit: "closed" never
 * said *which* outcome, even though the dashboard already treated it
 * as a terminal state alongside "lost".
 *
 * IMPORTANT — "won" means "successful sales opportunity", not "vehicle
 * sold". No vehicle status is ever changed as a side effect of a lead
 * reaching "won" (see lead-service.ts). The point at which a vehicle
 * actually becomes SOLD belongs to a future Deal/Sale mission.
 */
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "negotiating",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Non-terminal — the opportunity is still open. */
export const LEAD_ACTIVE_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "negotiating",
] as const satisfies readonly LeadStatus[];

/** Terminal — the opportunity has been decided one way or the other. */
export const LEAD_TERMINAL_STATUSES = ["won", "lost"] as const satisfies readonly LeadStatus[];

export function isLeadStatusTerminal(status: LeadStatus): boolean {
  return (LEAD_TERMINAL_STATUSES as readonly LeadStatus[]).includes(status);
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * A customer's interest, optionally tied to a specific vehicle.
 * `vehicleId` is nullable — see schema.ts for why (vehicle deletion
 * sets it to null rather than destroying the lead). `vehicleLabel` is
 * a snapshot of that vehicle's identity ("{year} {make} {model}") at
 * creation time — it survives vehicleId being nulled, so a lead
 * whose vehicle was later deleted still says which vehicle it was
 * about, instead of becoming indistinguishable from a lead that
 * never had one.
 */
export type Lead = {
  id: string;
  /** Mission 012 — which business owns this lead. */
  businessId: string;
  customerId: string;
  vehicleId: string | null;
  vehicleLabel: string | null;
  /** Mission 030 — Furniture-vertical equivalent of vehicleId/vehicleLabel. A given lead only ever populates one of the two pairs (a business is always exactly one vertical) — see schema.ts's leads table comment. */
  furnitureProductId: string | null;
  furnitureProductLabel: string | null;
  status: LeadStatus;
  source: string;
  notes: string;
  /** Mission 015 — auto-set whenever status successfully transitions. Never client-settable. */
  lastContactedAt: string | null;
  /** Mission 015 — staff-set date for the next planned follow-up. */
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
};

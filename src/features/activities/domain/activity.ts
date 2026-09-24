/**
 * Mission 017 — Atlas's CRM activity/history domain.
 *
 * Manual types are user-selectable through the "log an activity" UI.
 * Automatic types are exclusively service/action-generated — never
 * accepted as a client-supplied `type` on the manual-entry path (see
 * createCustomerActivityAction), so a client can never forge a
 * status-change or lead-created record.
 */
export const MANUAL_ACTIVITY_TYPES = ["note", "call", "meeting", "email"] as const;
export const AUTOMATIC_ACTIVITY_TYPES = [
  "lead_created",
  "status_change",
  "follow_up_scheduled",
  "follow_up_completed",
  // Mission 018 — Deal events. Deal activities are recorded against
  // the same customerId/leadId columns as every other activity (a
  // Deal always has an originating Lead — see deals.leadId in
  // schema.ts), so no new column was needed to integrate them; the
  // deal's own id travels in `metadata` instead (see
  // DealStatusChangeMetadata below), the same way status_change
  // carries fromStatus/toStatus there rather than as dedicated
  // columns.
  "deal_created",
  "deal_status_changed",
  // Mission 019 — Sale is the completed-transaction record; its
  // creation is a single, immutable event (no "sale_status_changed"
  // — a Sale has no lifecycle to change, see domain/sale.ts), so one
  // type is all this needs, avoiding the duplicate-event proliferation
  // the mission explicitly warns against.
  "sale_created",
] as const;

export const ACTIVITY_TYPES = [...MANUAL_ACTIVITY_TYPES, ...AUTOMATIC_ACTIVITY_TYPES] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type ManualActivityType = (typeof MANUAL_ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  lead_created: "Lead created",
  status_change: "Status change",
  follow_up_scheduled: "Follow-up scheduled",
  follow_up_completed: "Follow-up completed",
  deal_created: "Deal created",
  deal_status_changed: "Deal status changed",
  sale_created: "Sale finalized",
};

export function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

export function isManualActivityType(value: unknown): value is ManualActivityType {
  return typeof value === "string" && (MANUAL_ACTIVITY_TYPES as readonly string[]).includes(value);
}

/** Structured detail for a status_change activity — see schema.ts's `metadata` column comment. */
export type StatusChangeMetadata = {
  fromStatus: string;
  toStatus: string;
};

/** Structured detail for deal_created / deal_status_changed — carries the deal's own id, since activities has no dealId column (see AUTOMATIC_ACTIVITY_TYPES comment above). */
export type DealActivityMetadata = {
  dealId: string;
  fromStatus?: string;
  toStatus?: string;
};

/** Structured detail for sale_created — carries the sale's own id, the same way DealActivityMetadata carries dealId (activities has no saleId column either). */
export type SaleActivityMetadata = {
  saleId: string;
  dealId: string;
};

export type ActivityMetadata =
  | StatusChangeMetadata
  | DealActivityMetadata
  | SaleActivityMetadata
  | Record<string, unknown>
  | null;

export type Activity = {
  id: string;
  businessId: string;
  customerId: string;
  /** Null for a customer-level activity not tied to any specific lead. */
  leadId: string | null;
  /** The authenticated user who performed/recorded this — always server-derived, never client-supplied. */
  userId: string;
  type: ActivityType;
  content: string;
  metadata: ActivityMetadata;
  createdAt: string;
};

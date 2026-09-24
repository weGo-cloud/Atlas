import type { LeadStatus } from "./lead";

export type CreateLeadInput = {
  customerId: string;
  vehicleId?: string | null;
  /**
   * Snapshot of the vehicle's "{year} {make} {model}" at creation
   * time — computed by LeadService (which has vehicle data available
   * for the existence check anyway), not meant to be set directly by
   * UI or action callers.
   */
  vehicleLabel?: string | null;
  /** Mission 030 — Furniture-vertical equivalent of vehicleId. Also computed by LeadService, not meant to be set directly. */
  furnitureProductId?: string | null;
  furnitureProductLabel?: string | null;
  /** Defaults to "new" when omitted. */
  status?: LeadStatus;
  source?: string;
  notes?: string;
  /** Mission 015 — optional at creation, e.g. "call back Wednesday" set immediately after a first contact. */
  nextFollowUpAt?: string | null;
};

/** Editable fields after creation — status changes go through the dedicated updateLeadStatus path instead, not this generic update. */
export type UpdateLeadInput = {
  source?: string;
  notes?: string;
  /** Mission 015 — pass null to clear it. */
  nextFollowUpAt?: string | null;
};

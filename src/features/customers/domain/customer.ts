/**
 * A dealership contact. Intentionally small — see Mission 010's
 * final report for what was deliberately left out (auth fields,
 * financial data, demographic speculation).
 */
export type Customer = {
  id: string;
  /** Mission 012 — which business owns this contact. */
  businessId: string;
  name: string;
  /** Nullable — a customer may have only an email, or only a phone. */
  phone: string | null;
  email: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

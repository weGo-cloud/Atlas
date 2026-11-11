/**
 * Mission 019 — the authoritative, historical record of a finalized
 * dealership transaction.
 *
 * `Lead = opportunity, Deal = commercial negotiation, Sale = completed
 * transaction`. A Sale always originates from a `completed` Deal
 * (validated in SaleService, never trusted from the client) and is
 * effectively immutable once created — there is deliberately no
 * update method anywhere in this feature. If a correction is ever
 * genuinely needed, that's a future accounting/adjustment mission's
 * job, not a mutation on this type.
 *
 * No status field: unlike Deal, Sale has no lifecycle. Its existence
 * *is* the fact — "finalized" the moment the row is written. Adding a
 * status enum here would be building a second completion state next
 * to Deal's, which Mission 019 explicitly warns against.
 */
export type Sale = {
  id: string;
  businessId: string;
  dealId: string;
  customerId: string;
  vehicleId: string | null;
  vehicleLabel: string | null;
  /** The final, historical transaction amount — independent of the vehicle's current listing price and the deal's agreed price from the moment this is written. */
  saleAmount: number;
  soldAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

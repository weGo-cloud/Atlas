export type CreateSaleInput = {
  dealId: string;
  /** Defaults to the originating deal's agreedPrice when omitted (Mission 019, Section 5). */
  saleAmount?: number;
  notes?: string;
};

/**
 * Deliberately no UpdateSaleInput. Mission 019, Section 6: a Sale is
 * effectively immutable after creation — customer, vehicle,
 * originating deal, sale amount, and sale timestamp are all
 * unrestricted-editing candidates the mission explicitly forbids, and
 * `notes` was included in the same "historical record" treatment
 * rather than carved out as the one editable field, to keep the
 * immutability guarantee unambiguous. A future correction/adjustment
 * mechanism is out of scope here.
 */

export type CreateDealInput = {
  leadId: string;
  /**
   * Required unless the originating Lead already has a vehicle of
   * interest, in which case it defaults to that vehicle (Mission 018,
   * Section 5 — "Deal vehicle should correspond to the Lead's vehicle
   * of interest unless the domain explicitly allows a controlled
   * change"). Passing a different vehicleId than the Lead's is a
   * deliberate, controlled override, not an error.
   */
  vehicleId?: string;
  /** Defaults to the vehicle's current listing price when omitted. */
  agreedPrice?: number;
  depositAmount?: number | null;
  notes?: string;
};

/** Editable fields after creation. Status changes go through the dedicated updateDealStatus path instead, not this generic update — mirrors LeadService's UpdateLeadInput. Customer/Lead/Vehicle relationships are not editable here (Mission 018, Section 17). */
export type UpdateDealInput = {
  agreedPrice?: number;
  /** Pass null to clear a previously recorded deposit. */
  depositAmount?: number | null;
  notes?: string;
};

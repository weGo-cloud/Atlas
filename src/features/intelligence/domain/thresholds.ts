/**
 * Mission 021 — every threshold a rule compares against, in one
 * place (Section 4: "isolate threshold configuration from the UI",
 * Section 16: "exact thresholds centralized, documented and
 * tested"). No rule file hard-codes a magic number itself; every
 * comparison reads from here, so tuning a threshold is a one-line
 * change with no risk of a stale duplicate elsewhere.
 */
export const INTELLIGENCE_THRESHOLDS = {
  /**
   * A completed Deal with no Sale record is a data-integrity gap
   * (Section 4). Even one is worth surfacing; three or more escalates
   * to CRITICAL since it suggests a systemic gap in the Deal→Sale
   * workflow rather than a single missed record.
   */
  completedDealsAwaitingSale: {
    warning: 1,
    critical: 3,
  },

  /**
   * Overdue follow-ups are leads a business already knows it should
   * have contacted by now. A handful is normal daily backlog; a
   * larger pile signals the team is falling behind on lead response.
   */
  overdueFollowUps: {
    warning: 3,
    critical: 8,
  },

  /**
   * A sales-trend decline is only measured when there's enough
   * history to distinguish a trend from noise — one slow bucket next
   * to one good one isn't a trend. The ratio compares the most recent
   * bucket's gross value to the average of the prior buckets;
   * `warningDeclineRatio: 0.5` means "less than half of the recent
   * average" triggers WARNING, `0.25` (a quarter) triggers CRITICAL.
   */
  salesTrend: {
    minBucketsForTrend: 3,
    warningDeclineRatio: 0.5,
    criticalDeclineRatio: 0.25,
  },

  /**
   * "Days of supply" = available vehicles ÷ (sales in range ÷ span
   * days) — how many days the current stock would last at the
   * observed sales pace. Only evaluated when the range has a known
   * span of at least `minSpanDays` (an unbounded/very short range
   * makes the sales-per-day rate too noisy to trust) and there's at
   * least `minAvailableVehicles` in stock (flagging "3 cars, 0 sales
   * in a week" as an inventory crisis is noise, not signal).
   */
  inventoryOversupply: {
    minAvailableVehicles: 5,
    minSpanDays: 14,
    warningDaysOfSupply: 90,
    criticalDaysOfSupply: 180,
  },

  /**
   * Lead→Deal conversion rate is only evaluated with a sample large
   * enough that the rate is meaningful (2 leads, 0 converted is a
   * 0% rate that means nothing). Below the warning rate suggests
   * qualification or follow-through issues; below the critical rate
   * suggests the pipeline is barely converting at all.
   */
  leadConversion: {
    minLeads: 10,
    warningRate: 0.15,
    criticalRate: 0.05,
  },

  /**
   * A pipeline is "stagnant" when most of its leads (in range) are
   * still sitting in an active, undecided status rather than reaching
   * won/lost — leads are piling up faster than the team is deciding
   * them one way or the other. Same minimum-sample guard as
   * leadConversion.
   */
  stagnantPipeline: {
    minLeads: 10,
    warningActiveRatio: 0.7,
    criticalActiveRatio: 0.85,
  },

  /**
   * Mission 026 — "days in inventory while still available" is a
   * standard automotive aging-inventory benchmark: 60 days is the
   * commonly used point where holding cost/depreciation risk starts
   * to matter enough to warrant review; 90 days (double that) is
   * where it's clearly overdue for a pricing/marketing/disposal
   * decision. Driven by the single *oldest* available vehicle's age,
   * the same "one continuous metric against two thresholds" shape
   * every other two-tier M021 rule already uses — vehicle count is
   * evidence, not the severity driver.
   */
  vehicleAttention: {
    warningAgeDays: 60,
    criticalAgeDays: 90,
  },
} as const;

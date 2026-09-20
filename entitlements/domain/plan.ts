/**
 * Mission 027 (correction) / Mission 028 — Atlas Core's subscription
 * tiers. Deliberately code-defined, not a database table: nothing in
 * Atlas today needs an admin to redefine what "growth" means at
 * runtime, so — the same reasoning `permissions.ts`'s ROLE_PERMISSIONS
 * already follows for roles — the plan *catalog* lives in code, while
 * the *fact* that a given business is currently on a given plan lives
 * in the database (see subscription.ts / the `subscriptions` table).
 * That split is Section 10's explicit "plan definition" vs.
 * "organization subscription" distinction.
 */
export const SUBSCRIPTION_PLANS = ["starter", "growth", "pro"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export function isSubscriptionPlan(value: string): value is SubscriptionPlan {
  return (SUBSCRIPTION_PLANS as readonly string[]).includes(value);
}

/**
 * Every capability Atlas currently gates by plan. Deliberately a
 * flat, vertical-agnostic string union — the same "small allowlist,
 * not a framework" discipline `PERMISSIONS` (auth/domain/permissions.ts)
 * already follows, applied to subscription-tier gating instead of
 * role gating.
 *
 * Mission 028, Section 5 lists many *possible* future capabilities
 * (predictive_intelligence, automation, website_builder, ...). Only
 * the two that something in Atlas actually checks today are declared
 * here — adding a real gate for one of the others later is a one-line
 * addition to this union and to PLAN_CAPABILITIES, not an
 * architecture change (Section 27: don't build a feature-flag
 * platform for flags nothing uses yet).
 */
export const CAPABILITIES = ["storefront", "external_integration", "marketing_automation"] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Every usage limit Atlas currently enforces. Same discipline as
 * CAPABILITIES — one real, enforced limit per vertical (Section 9:
 * "enforce only limits that are actually needed by existing
 * functionality"), not a speculative limits-for-everything table.
 *
 * Mission 030 — "furniture_products" is a separate key from
 * "vehicles" rather than a shared, renamed "inventory_items": a
 * business is always exactly one vertical, so the two keys are never
 * both relevant for the same business, and keeping them distinct
 * means the Furniture vertical's limit can be tuned independently of
 * Auto's without touching Auto's plan numbers at all.
 */
export const LIMIT_KEYS = ["vehicles", "furniture_products"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/**
 * Mission 029, Section 3 — billing cadences a plan can conceptually be
 * sold under. No payment provider is connected (Section 21 of both
 * missions), so this is only ever used to *represent* which cadences
 * would apply once one is, never to compute an actual charge.
 */
export const BILLING_INTERVALS = ["monthly", "annual"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/**
 * Mission 029, Section 3 — "if actual prices do not yet exist,
 * represent pricing as configurable data or clearly mark it as not
 * configured. Never fabricate prices for production." `configured:
 * false` is the explicit marker; `amount` stays null for every plan
 * until a real price is entered here. The UI (plan-catalog display)
 * must check `configured` before rendering anything price-shaped —
 * see PlanPresentation's "Contact us for pricing" fallback.
 */
export type PlanPricing =
  | { configured: false }
  | { configured: true; amount: number; currency: string; interval: BillingInterval };

/**
 * Mission 029, Section 3 — "active/inactive state" so a plan can stop
 * being newly assignable without deleting its definition (existing
 * subscribers on a retired plan keep their row; nothing here forces a
 * migration off it). Every plan shipped today is "active" — nothing
 * in Atlas has a retired plan yet — but changePlan (see
 * subscription-lifecycle-service.ts) enforces this for any future
 * plan that becomes "inactive".
 */
export const PLAN_STATUSES = ["active", "inactive"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Pure predicate over a bare status — kept independent of the real catalog so it's unit-testable without needing a fabricated inactive product plan (see domain/__tests__/plan.test.ts). */
export function isAssignableStatus(status: PlanStatus): boolean {
  return status === "active";
}

export type PlanDefinition = {
  id: SubscriptionPlan;
  name: string;
  /** Mission 029 — one to two sentences, factual capability description only (Section 4: no "guaranteed more sales" style claims). Rendered as-is in the plan comparison UI. */
  description: string;
  status: PlanStatus;
  /** Mission 029, Section 3 — display/sort order in the plan comparison UI, ascending. Independent of the tuple order in SUBSCRIPTION_PLANS so re-ordering the catalog doesn't require touching every list that iterates it. */
  order: number;
  capabilities: ReadonlySet<Capability>;
  /** Missing key = unlimited for that plan. */
  limits: Partial<Record<LimitKey, number>>;
  billingIntervals: readonly BillingInterval[];
  pricing: PlanPricing;
};

/**
 * The one place every plan's capabilities and limits are legible at a
 * glance — the Commercial Platform's central catalog, mirroring
 * `ROLE_PERMISSIONS`'s table shape exactly. A capability not listed
 * for a plan is implicitly denied; a limit key not listed for a plan
 * is implicitly unlimited.
 *
 * Deliberately additive/cumulative (growth ⊇ starter, pro ⊇ growth)
 * — the conventional SaaS tier shape — but nothing downstream
 * (hasCapability, limitFor) assumes that shape, so a future
 * non-cumulative add-on plan is just a new entry here.
 */
const PLANS: Record<SubscriptionPlan, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    description: "Core inventory and CRM for a single-location dealership getting started with Atlas.",
    status: "active",
    order: 0,
    capabilities: new Set([]),
    limits: { vehicles: 50, furniture_products: 50 },
    billingIntervals: BILLING_INTERVALS,
    pricing: { configured: false },
  },
  growth: {
    id: "growth",
    name: "Growth",
    description: "Adds the Atlas-hosted public storefront and a higher inventory ceiling for a growing lot.",
    status: "active",
    order: 1,
    capabilities: new Set(["storefront", "marketing_automation"]),
    limits: { vehicles: 250, furniture_products: 250 },
    billingIntervals: BILLING_INTERVALS,
    pricing: { configured: false },
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Unlimited vehicles plus the external-integration API for dealers running their own website.",
    status: "active",
    order: 2,
    capabilities: new Set(["storefront", "external_integration", "marketing_automation"]),
    limits: {}, // unlimited
    billingIntervals: BILLING_INTERVALS,
    pricing: { configured: false },
  },
};

export function planDefinition(plan: SubscriptionPlan): PlanDefinition {
  return PLANS[plan];
}

/** Every plan in the catalog, in display order — the source of truth for any plan-comparison UI (Mission 029, Section 4). Never hard-code a plan list in a component. */
export function listPlans(): PlanDefinition[] {
  return Object.values(PLANS).sort((a, b) => a.order - b.order);
}

/** Whether `plan` is currently allowed to be *newly assigned* (e.g. via an upgrade/downgrade or a fresh subscription). An inactive plan's existing subscribers are unaffected — this only gates new assignment. */
export function isPlanAssignable(plan: SubscriptionPlan): boolean {
  return isAssignableStatus(PLANS[plan].status);
}

export function hasCapability(plan: SubscriptionPlan, capability: Capability): boolean {
  return PLANS[plan].capabilities.has(capability);
}

/** Every capability a plan is entitled to — used by the settings UI and upgrade prompts. */
export function capabilitiesFor(plan: SubscriptionPlan): Capability[] {
  return [...PLANS[plan].capabilities];
}

/** The plan's limit for a key, or `null` if the plan has no limit for it (unlimited). */
export function limitFor(plan: SubscriptionPlan, key: LimitKey): number | null {
  return PLANS[plan].limits[key] ?? null;
}

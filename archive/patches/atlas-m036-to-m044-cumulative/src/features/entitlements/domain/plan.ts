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
/**
 * Mission 038 — "assistant" is the customer-facing Atlas Assistant (website chat + WhatsApp). It is a
 * capability of its own because it is the one feature whose cost scales with *customer* traffic, not the
 * owner's own usage — so the free Starter plan must not include it (it previously wasn't gated at all,
 * which let a Starter business run AI replies on WhatsApp for free). "everest" stays the owner-facing assistant.
 */
/**
 * Mission 040 — "mpesa_collection": requesting M-Pesa STK-push payments from a customer's phone straight from a
 * deal. Recording payments by hand (cash, bank, M-Pesa receipt code...) is part of every plan, including free Starter.
 */
export const CAPABILITIES = ["storefront", "external_integration", "marketing_automation", "everest", "assistant", "mpesa_collection"] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Every usage limit Atlas currently enforces. Same discipline as
 * CAPABILITIES — one real, enforced limit per vertical (Section 9:
 * "enforce only limits that are actually needed by existing
 * functionality"), not a speculative limits-for-everything table.
 *
 * Mission 036 — "everest_messages" is the one monthly (not
 * cumulative) limit: how many messages a business may send to the
 * Everest (the in-app assistant) per calendar month. It is enforced by the
 * Everest feature itself (see features/everest), against the
 * usage it counts in its own tables, using the same plan-catalog
 * lookup every other limit uses.
 *
 * Mission 030 — "furniture_products" is a separate key from
 * "vehicles" rather than a shared, renamed "inventory_items": a
 * business is always exactly one vertical, so the two keys are never
 * both relevant for the same business, and keeping them distinct
 * means the Furniture vertical's limit can be tuned independently of
 * Auto's without touching Auto's plan numbers at all.
 */
export const LIMIT_KEYS = ["vehicles", "furniture_products", "everest_messages", "assistant_messages_daily"] as const;
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
 * Mission 036 — commercial constants, kept together so the owner can
 * retune them in one place. Prices are the owner's decision (Growth
 * KES 5,000/month, Pro KES 13,000/month); nothing here is a billing
 * integration — plan changes are still made by the owner via
 * SubscriptionLifecycleService.changePlan and payment is collected
 * manually for now.
 */
export const PLAN_CURRENCY = "KES";
/** Items a Starter (free) business can hold, per vertical. Only blocks *new* creates; existing rows are never touched (M029's no-data-loss rule). */
export const STARTER_ITEM_LIMIT = 30;
/** Length of the full-feature trial a new business starts on. */
export const TRIAL_DAYS = 14;
/** Plan a new business's trial runs on — everything on. */
export const TRIAL_PLAN: SubscriptionPlan = "pro";
/**
 * Whether an owner may switch themselves onto a *paid* plan from the
 * settings page. Atlas has no billing provider yet (payment is
 * collected manually), so a self-serve "Upgrade" button would hand out
 * paid plans for free. While this is false, only the Atlas team
 * switches a business onto a paid plan (see `scripts/set-plan.ts`);
 * owners can still downgrade to Starter and cancel on their own. Flip
 * to true only once a billing provider confirms payment before
 * `changePlan` runs.
 */
export const SELF_SERVE_PAID_UPGRADES = false;
/** Shown wherever an upgrade is offered while self-serve upgrades are off. Edit to the real contact route. */
export const UPGRADE_CONTACT_COPY = "Contact the Atlas team to upgrade — we'll switch your plan once payment is arranged.";
/** Messages per calendar month a Pro (or trial) business may send to Everest. Bounds AI cost per client. */
export const EVEREST_MONTHLY_MESSAGE_LIMIT = 500;

/**
 * Mission 038 — customer messages per UTC day the Atlas Assistant may answer for one business, by plan.
 * Bounds AI spend per paying client: at the default Haiku-class model a full day at the Pro cap is a small
 * fixed cost, so a bot or a viral post can't turn one client into an open-ended bill. When the cap is hit
 * the assistant stops answering for the rest of the day and customers are handed to the team. Tune here.
 */
export const ASSISTANT_DAILY_LIMIT_GROWTH = 150;
export const ASSISTANT_DAILY_LIMIT_PRO = 500;

/**
 * Mission 038 — tighter AI allowances while a business is still on its free trial. A trial runs on the Pro
 * plan so the owner can evaluate everything, but it is also the free, unpaid exposure; these caps keep the
 * cost of a trial that never converts small. They apply only while status is "trialing" (a paid Pro
 * subscription gets the full plan limits) and can only ever lower a plan's own limit.
 */
export const TRIAL_LIMITS: Partial<Record<LimitKey, number>> = {
  assistant_messages_daily: 60,
  everest_messages: 100,
};

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
    description: "Free. Inventory, leads, deals and customers for a single business, up to 30 items.",
    status: "active",
    order: 0,
    capabilities: new Set([]),
    limits: { vehicles: STARTER_ITEM_LIMIT, furniture_products: STARTER_ITEM_LIMIT },
    // No AI on the free plan, by design: Starter costs Atlas ~nothing to host (see ASSISTANT_DAILY_LIMIT_*).
    billingIntervals: BILLING_INTERVALS,
    // Mission 036 — Starter is the free tier every business falls back to when a trial or paid plan ends. Amount 0 is a real price (free), not an unconfigured one.
    pricing: { configured: true, amount: 0, currency: PLAN_CURRENCY, interval: "monthly" },
  },
  growth: {
    id: "growth",
    name: "Growth",
    description: "Adds the Atlas-hosted public storefront, the customer-facing Atlas Assistant (website chat and WhatsApp, up to 150 customer messages a day) and the external-integration API, with up to 250 items.",
    status: "active",
    order: 1,
    capabilities: new Set(["storefront", "external_integration", "assistant", "mpesa_collection"]),
    limits: { vehicles: 250, furniture_products: 250, assistant_messages_daily: ASSISTANT_DAILY_LIMIT_GROWTH },
    billingIntervals: BILLING_INTERVALS,
    pricing: { configured: true, amount: 5000, currency: PLAN_CURRENCY, interval: "monthly" },
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Everything in Growth plus the social media manager and marketing channels, the Everest assistant, a higher customer-assistant allowance (up to 500 messages a day), and unlimited items.",
    status: "active",
    order: 2,
    capabilities: new Set(["storefront", "external_integration", "marketing_automation", "everest", "assistant", "mpesa_collection"]),
    // Items are unlimited on Pro; AI use is capped: Everest monthly (EVEREST_MONTHLY_MESSAGE_LIMIT) and the customer assistant daily (ASSISTANT_DAILY_LIMIT_PRO).
    limits: { everest_messages: EVEREST_MONTHLY_MESSAGE_LIMIT, assistant_messages_daily: ASSISTANT_DAILY_LIMIT_PRO },
    billingIntervals: BILLING_INTERVALS,
    pricing: { configured: true, amount: 13000, currency: PLAN_CURRENCY, interval: "monthly" },
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

/**
 * Mission 038 — the limit that actually applies right now: the plan's own limit, lowered by the trial
 * allowance when the (effective) status is "trialing". `null` still means unlimited. Always call this with
 * the *effective* status (EntitlementService resolves it) so an elapsed trial gets Starter's limits, not Pro's.
 */
export function effectiveLimitFor(plan: SubscriptionPlan, status: string, key: LimitKey): number | null {
  const planLimit = limitFor(plan, key);
  const trialLimit = status === "trialing" ? (TRIAL_LIMITS[key] ?? null) : null;
  if (planLimit === null) return trialLimit;
  if (trialLimit === null) return planLimit;
  return Math.min(planLimit, trialLimit);
}

/** Mission 036 — true for any plan with a configured price above zero. Unconfigured pricing is never treated as paid (and never as free) by this helper. */
export function isPaidPlan(plan: SubscriptionPlan): boolean {
  const pricing = PLANS[plan].pricing;
  return pricing.configured && pricing.amount > 0;
}

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Persistent Vehicle table — the durable counterpart to the domain
 * `Vehicle` type in `src/features/inventory/data/types.ts`.
 *
 * Column names mirror the domain model exactly (including `addedAt`,
 * not `createdAt`) so the repository mapping layer stays a straight
 * 1:1 conversion instead of a renaming exercise.
 *
 * `status` is stored as TEXT rather than a native enum: SQLite has no
 * enum type, and the `VehicleStatus` union is already validated at
 * the domain boundary (`validate-vehicle-input.ts`) before it reaches
 * the repository, so a DB-level enum would be redundant here. Moving
 * to Postgres later can add a native enum/check constraint without
 * changing this file's shape.
 */
export const vehicles = sqliteTable(
  "vehicles",
  {
    id: text("id").primaryKey(),
    // Mission 012 — tightened to NOT NULL in migration 0006, after
    // the backfill script (scripts/backfill-business-ownership.ts)
    // confirmed every pre-existing row had an owner.
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    // .unique() already creates its own index — no separate explicit
    // index is needed for stockId lookups (a redundant one existed
    // here until Mission 008 removed it).
    stockId: text("stock_id").notNull().unique(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: integer("year").notNull(),
    mileage: integer("mileage").notNull(),
    price: integer("price").notNull(),
    status: text("status").notNull(),
    description: text("description").notNull().default(""),
    addedAt: text("added_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // The highest-traffic filter of all — every single vehicle query
    // now scopes by business first.
    index("vehicles_business_id_idx").on(table.businessId),
    // status is filtered on by the inventory toolbar and counted by
    // the summary cards — the highest-traffic filter field.
    index("vehicles_status_idx").on(table.status),
    // price and year both have dedicated sort options and range
    // filters in the query model — justified, not speculative.
    index("vehicles_price_idx").on(table.price),
    index("vehicles_year_idx").on(table.year),
    // "newest added" is the default inventory sort.
    index("vehicles_added_at_idx").on(table.addedAt),
  ]
);

export type VehicleRow = typeof vehicles.$inferSelect;
export type NewVehicleRow = typeof vehicles.$inferInsert;

/**
 * Persistent vehicle photo metadata (Mission 007). Stores only a
 * reference (`url`) to the actual image — the binary lives in file
 * storage (local disk for V1; see `src/lib/storage`), never in the
 * database. `onDelete: "cascade"` means removing a vehicle row also
 * removes its photo rows automatically — there's no vehicle-delete
 * feature yet, but this keeps that constraint true the moment one
 * exists, without needing app-layer cleanup code.
 */
export const vehiclePhotos = sqliteTable(
  "vehicle_photos",
  {
    id: text("id").primaryKey(),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    position: integer("position").notNull().default(0),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Every photo lookup/list/reorder operation is scoped to one
    // vehicle — this is the hot path index for the whole feature.
    index("vehicle_photos_vehicle_id_idx").on(table.vehicleId),
  ]
);

export type VehiclePhotoRow = typeof vehiclePhotos.$inferSelect;
export type NewVehiclePhotoRow = typeof vehiclePhotos.$inferInsert;

/**
 * Customer contact record (Mission 010).
 *
 * Uniqueness: phone and email are intentionally NOT unique. Real
 * dealership customers legitimately share contact details — a spouse
 * booking on a partner's phone, a business account used by several
 * buyers, a shared family email. Enforcing uniqueness here would
 * reject valid walk-in data entry. Duplicate *detection* (flagging,
 * not blocking) is a reasonable future enhancement, not a DB
 * constraint. Both fields are nullable — validation only requires at
 * least one contact method between the two (enforced in
 * domain/validate-customer-input.ts, not at the schema level).
 */
export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    // Mission 012 — tightened to NOT NULL in migration 0006 (see the
    // vehicles table's businessId comment for the full rationale).
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("customers_business_id_idx").on(table.businessId),
    // Customer search (Phase 4) matches name/phone/email — all three
    // are justified search-path indexes, not speculative.
    index("customers_name_idx").on(table.name),
    index("customers_phone_idx").on(table.phone),
    index("customers_email_idx").on(table.email),
  ]
);

export type CustomerRow = typeof customers.$inferSelect;
export type NewCustomerRow = typeof customers.$inferInsert;

/**
 * A lead connects a customer to (optionally) a specific vehicle.
 *
 * Deletion behavior — deliberately asymmetric, reasoned per-relationship:
 *
 * - customerId: NOT NULL, ON DELETE CASCADE. A lead's entire purpose
 *   is tracking one customer's interest; without that customer it has
 *   no subject. There is no customer-delete feature in this mission
 *   (CustomerRepository only supports create/read/update), so this is
 *   dormant today — but should be revisited (e.g. toward a soft-delete
 *   model) if/when customer deletion is ever built, so a real sales
 *   history isn't destroyed by a single click.
 *
 * - vehicleId: NULLABLE, ON DELETE SET NULL. Vehicle deletion is a
 *   real, actively-used feature as of Mission 008. Cascading leads
 *   away with the vehicle would silently destroy exactly the business
 *   data this phase warns against — "a customer was interested in
 *   this listing" remains true and useful (contact history, notes,
 *   status) even after the specific listing is gone. The lead survives
 *   with vehicleId set to null; the UI renders that as "vehicle no
 *   longer in inventory" rather than erasing the record.
 */
export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    // Mission 012 — tightened to NOT NULL in migration 0006 (see the
    // vehicles table's businessId comment for the full rationale).
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    vehicleId: text("vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    /**
     * Snapshot of "{year} {make} {model}" captured at lead creation
     * (Mission 011). ON DELETE SET NULL clears vehicleId when the
     * vehicle is deleted, erasing *which* vehicle the lead was about —
     * this column survives that, so a lead can still say "customer
     * was interested in the 2022 Toyota Harrier" even after that
     * listing is long gone, rather than collapsing into the same
     * "no vehicle" state as a lead that never had one.
     */
    vehicleLabel: text("vehicle_label"),
    /**
     * Mission 030 — the Furniture-vertical equivalent of vehicleId/
     * vehicleLabel above, added rather than generalizing the existing
     * columns: a business is always exactly one vertical (Auto or
     * Furniture, never both — see businesses.vertical), so a given
     * lead row only ever populates one of the two pairs. Renaming
     * vehicleId to something vertical-neutral would touch every
     * existing Auto lead row and every piece of code that already
     * reads it, for a column that's never actually ambiguous in
     * practice; adding a parallel nullable pair is the additive,
     * zero-risk option (Mission 030, Section 21: "do not modify Auto
     * data destructively").
     */
    furnitureProductId: text("furniture_product_id").references(
      () => furnitureProducts.id,
      { onDelete: "set null" }
    ),
    furnitureProductLabel: text("furniture_product_label"),
    status: text("status").notNull().default("new"),
    source: text("source").notNull().default(""),
    notes: text("notes").notNull().default(""),
    /**
     * Mission 015 — set automatically whenever the lead's status
     * successfully transitions (not client-settable). Answers
     * "when did we last do something with this lead" without needing
     * a full activity log.
     */
    lastContactedAt: text("last_contacted_at"),
    /**
     * Mission 015 — staff-set date for the next planned follow-up.
     * Nullable; freeform (not restricted to future dates) so it can
     * also be cleared or corrected. Indexed below since "what needs
     * follow-up" is a real filter/dashboard query, not just display.
     */
    nextFollowUpAt: text("next_follow_up_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("leads_business_id_idx").on(table.businessId),
    index("leads_customer_id_idx").on(table.customerId),
    index("leads_vehicle_id_idx").on(table.vehicleId),
    index("leads_furniture_product_id_idx").on(table.furnitureProductId),
    // status powers dashboard bucket counts and lead-list filtering.
    index("leads_status_idx").on(table.status),
    // "recent leads" (dashboard + customer/vehicle detail) sorts by this.
    index("leads_created_at_idx").on(table.createdAt),
    // Mission 015 — "leads due/overdue for follow-up" filter.
    index("leads_next_follow_up_at_idx").on(table.nextFollowUpAt),
  ]
);

/**
 * Mission 030 — the Wego Furniture vertical's product table. A
 * deliberately separate table from `vehicles` (Section 23's "Option
 * B"), not a shared `products` base table with vertical-specific
 * columns bolted on: furniture attributes (material, color,
 * dimensions, condition) and vehicle attributes (make, model, year,
 * mileage) don't overlap enough to make a shared base table anything
 * but a wide, mostly-null compromise, and Atlas has exactly two
 * verticals today — the abstraction cost of a generic Product table
 * isn't earning its keep yet. Mirrors `vehicles`' shape/conventions
 * closely (businessId scoping, status as the availability field,
 * addedAt/updatedAt) so the two features stay recognizably siblings.
 */
export const furnitureProducts = sqliteTable(
  "furniture_products",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    price: integer("price").notNull(),
    currency: text("currency").notNull().default("KES"),
    condition: text("condition").notNull(),
    /** "available" | "reserved" | "sold" — same three-value shape as vehicles.status, deliberately not generalized into a shared enum (see the table-level comment). */
    status: text("status").notNull(),
    material: text("material"),
    color: text("color"),
    /** Freeform, e.g. "180cm x 90cm x 75cm" — a single text field rather than separate width/height/depth columns; Section 5 explicitly warns against fields without a clear use-case, and no filtering/sorting on individual dimensions is required for this mission. */
    dimensions: text("dimensions"),
    sku: text("sku"),
    addedAt: text("added_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("furniture_products_business_id_idx").on(table.businessId),
    index("furniture_products_status_idx").on(table.status),
    index("furniture_products_category_idx").on(table.category),
    index("furniture_products_price_idx").on(table.price),
    index("furniture_products_added_at_idx").on(table.addedAt),
  ]
);

export type FurnitureProductRow = typeof furnitureProducts.$inferSelect;
export type NewFurnitureProductRow = typeof furnitureProducts.$inferInsert;

/** Mirrors `vehiclePhotos` exactly — see that table's comment. */
export const furnitureProductPhotos = sqliteTable(
  "furniture_product_photos",
  {
    id: text("id").primaryKey(),
    furnitureProductId: text("furniture_product_id")
      .notNull()
      .references(() => furnitureProducts.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    position: integer("position").notNull().default(0),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("furniture_product_photos_product_id_idx").on(table.furnitureProductId),
  ]
);

export type FurnitureProductPhotoRow = typeof furnitureProductPhotos.$inferSelect;
export type NewFurnitureProductPhotoRow = typeof furnitureProductPhotos.$inferInsert;

export type LeadRow = typeof leads.$inferSelect;
export type NewLeadRow = typeof leads.$inferInsert;

/**
 * Mission 018 — a commercial transaction in progress, connecting a
 * qualified Lead to a specific Vehicle. `Customer → Lead → Deal →
 * Vehicle`: a Lead is the sales opportunity, a Deal is the
 * transaction being negotiated over it, and a future Sale (not built
 * here) will represent a completed transaction. See domain/deal.ts
 * for the full status lifecycle and domain/deal-status.ts for the
 * allowed-transition table.
 *
 * Deletion behavior mirrors the precedent set by `leads` for exactly
 * the same reasons:
 *
 * - customerId: NOT NULL, ON DELETE CASCADE — same rationale as
 *   leads.customerId (dormant today; no customer-delete feature).
 *
 * - leadId: NOT NULL, no onDelete override (defaults to RESTRICT).
 *   Unlike a Deal's vehicle, a Deal's originating Lead is not
 *   optional — it's the opportunity the transaction exists to
 *   fulfill — so there is no sensible "SET NULL" state for it. Lead
 *   deletion doesn't exist in Atlas (same as customers), so this is
 *   dormant, not actively constraining anything today.
 *
 * - vehicleId: NULLABLE, ON DELETE SET NULL, with a `vehicleLabel`
 *   snapshot alongside it — identical treatment to leads.vehicleId.
 *   Vehicle deletion is a real, active feature; a Deal's commercial
 *   history (price, deposit, status) must survive it exactly the way
 *   a Lead's history does. Deal *creation* still requires a vehicle
 *   (enforced in DealService, not the schema — see Mission 018's
 *   final report, "Vehicle Integrity") since a Deal without a vehicle
 *   has nothing to transact over; this column only goes nullable
 *   *after* creation, when the referenced listing is later removed.
 *
 * `agreedPrice` is deliberately a separate column from
 * `vehicles.price` — a Deal negotiates away from the listing price,
 * and changing one must never mutate the other (Mission 018, Section
 * 7). `depositAmount` is nullable: most deals never reach a
 * recorded deposit, and the column plays no role until one is
 * entered.
 *
 * The partial unique index below is the actual concurrency-safe
 * enforcement of "no duplicate active Deal per Lead" (Mission 018,
 * Section 9/23) — a service-level check alone has the same
 * check-then-insert race that Mission 017 fixed for follow-up
 * completion. SQLite (and this Drizzle version) support partial
 * indexes via `.where()`, so this is enforced by the database itself,
 * not just application code: at most one row per leadId may have a
 * status outside `completed`/`cancelled` at any time.
 */
export const deals = sqliteTable(
  "deals",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id),
    vehicleId: text("vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    /** Snapshot of "{year} {make} {model}" at Deal creation — survives vehicleId being nulled. Mirrors leads.vehicleLabel exactly. */
    vehicleLabel: text("vehicle_label"),
    status: text("status").notNull().default("draft"),
    /** The negotiated price for this transaction — independent of vehicles.price (the current listing price). Defaults to the vehicle's listing price at creation but is freely editable afterward. */
    agreedPrice: integer("agreed_price").notNull(),
    /** Recorded deposit amount — a commercial record only, never a payment-processing balance. Nullable: most deals never reach one. */
    depositAmount: integer("deposit_amount"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("deals_business_id_idx").on(table.businessId),
    index("deals_customer_id_idx").on(table.customerId),
    index("deals_lead_id_idx").on(table.leadId),
    index("deals_vehicle_id_idx").on(table.vehicleId),
    // Status powers deal-list filtering and the customer/lead/vehicle
    // detail-page summaries — same justification as leads_status_idx.
    index("deals_status_idx").on(table.status),
    index("deals_created_at_idx").on(table.createdAt),
    // Partial unique index — see the table comment above. Only rows
    // whose status is neither 'completed' nor 'cancelled' participate,
    // so a Lead can accumulate any number of *historical* Deals but
    // never more than one *active* one at a time.
    uniqueIndex("deals_lead_id_active_uidx")
      .on(table.leadId)
      .where(sql`${table.status} not in ('completed', 'cancelled')`),
  ]
);

export type DealRow = typeof deals.$inferSelect;
export type NewDealRow = typeof deals.$inferInsert;

/**
 * Mission 019 — the authoritative, historical record of a finalized
 * dealership transaction. `Lead = opportunity, Deal = commercial
 * negotiation, Sale = completed transaction`: a Sale always
 * originates from a `completed` Deal (enforced in SaleService, not
 * here) and is treated as effectively immutable once created — there
 * is deliberately no update path for this table (see SaleService).
 *
 * `dealId` is UNIQUE (not partial, unlike `deals_lead_id_active_uidx`)
 * — a Deal can produce at most one Sale, permanently, with no
 * "terminal exclusion" carve-out the way Deal's own lead-uniqueness
 * has one. This is the actual concurrency-safe enforcement of "one
 * Deal → one Sale" (Mission 019, Section 2): two concurrent Sale
 * creation attempts against the same Deal race on this constraint,
 * not on a service-level check.
 *
 * `vehicleId` is also UNIQUE among non-null values — SQLite treats
 * each NULL as distinct for uniqueness purposes, so this only ever
 * constrains sales that still reference a real vehicle row, which is
 * exactly what's needed: "one Vehicle → at most one completed Sale"
 * (Section 7), while still tolerating the vehicle later being
 * deleted (see below). ON DELETE SET NULL + a `vehicleLabel`
 * snapshot column mirror `leads.vehicleId`/`deals.vehicleId` exactly,
 * for the same reason — a Sale's historical record must survive its
 * vehicle listing being removed from inventory.
 *
 * `customerId` has no onDelete override (defaults to restrict) —
 * unlike `deals.customerId` (CASCADE), a Sale is the one table in
 * Atlas explicitly designed to remain trustworthy for historical
 * reporting (Mission 019's own engineering principle: "future Atlas
 * Analytics can calculate revenue, customer purchasing history...
 * without reconstructing history from mutable Lead or Deal state").
 * Silently cascading away a completed transaction's customer
 * reference would undermine exactly that guarantee, so this is a
 * deliberate divergence from Deal's convention, not an oversight.
 * Dormant today either way, since customer deletion doesn't exist.
 *
 * `saleAmount` is a separate column from both `vehicles.price` (the
 * current listing price) and `deals.agreedPrice` (the negotiated
 * price) — Section 5's three-way distinction. It defaults from the
 * originating Deal's `agreedPrice` at creation time only; nothing
 * keeps it in sync afterward, by design.
 */
export const sales = sqliteTable(
  "sales",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    vehicleId: text("vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    /** Snapshot of "{year} {make} {model}" at Sale creation — survives vehicleId being nulled. Copied from the originating Deal's own vehicleLabel. */
    vehicleLabel: text("vehicle_label"),
    /** The final, historical transaction amount — independent of vehicles.price and deals.agreedPrice from the moment this row is written. */
    saleAmount: integer("sale_amount").notNull(),
    soldAt: text("sold_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("sales_business_id_idx").on(table.businessId),
    index("sales_customer_id_idx").on(table.customerId),
    index("sales_sold_at_idx").on(table.soldAt),
    uniqueIndex("sales_deal_id_uidx").on(table.dealId),
    uniqueIndex("sales_vehicle_id_uidx").on(table.vehicleId),
  ]
);

export type SaleRow = typeof sales.$inferSelect;
export type NewSaleRow = typeof sales.$inferInsert;

/**
 * Mission 017 — Atlas's CRM "business memory": a durable, chronological
 * record of meaningful Customer/Lead events. Immutable by design (see
 * ActivityService — there is no update/delete path); corrections are
 * future scope, not this table's job.
 *
 * `businessId` is stored directly even though it's derivable via
 * `customerId`, matching every other table's convention (`leads` does
 * the same relative to `vehicleId`) — every activity query is scoped
 * by it directly rather than joining through customers.
 *
 * `customerId` is always set, even for lead-scoped activities (derived
 * from the lead's own customerId at creation time) — this is what lets
 * a single `WHERE customer_id = ?` query return a customer's full
 * timeline, including everything that happened on any of their leads,
 * without joining through `leads` at all.
 *
 * `leadId` is nullable: a manual note logged from the Customer page
 * with no specific lead in mind is a legitimate activity. ON DELETE
 * SET NULL mirrors `leads.vehicleId`'s precedent — lead deletion
 * doesn't exist in Atlas today, but if it ever does, the activity
 * should outlive the lead the same way a lead outlives a deleted
 * vehicle.
 *
 * `userId` has no onDelete override (defaults to restrict): user
 * deletion doesn't exist in Atlas either, and an audit-like history
 * should never silently cascade-delete just because a future mission
 * adds one.
 *
 * `metadata` is optional JSON (e.g. `{fromStatus, toStatus}` for a
 * status_change) — kept structured rather than folded into `content`
 * so a future automation/analytics/AI consumer (this mission's whole
 * reason for existing) doesn't have to parse an English sentence.
 */
export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull(),
    content: text("content").notNull().default(""),
    metadata: text("metadata"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("activities_business_id_idx").on(table.businessId),
    index("activities_customer_id_idx").on(table.customerId),
    index("activities_lead_id_idx").on(table.leadId),
    // Every timeline query orders by this; see the repository for the
    // (createdAt, id) compound ordering that breaks same-millisecond ties.
    index("activities_created_at_idx").on(table.createdAt),
  ]
);

export type ActivityRow = typeof activities.$inferSelect;
export type NewActivityRow = typeof activities.$inferInsert;

/**
 * Mission 012 — auth & business identity.
 *
 * A business is the tenant boundary: everything a dealership owns
 * (vehicles, customers, leads) is scoped to exactly one business.
 */
export const businesses = sqliteTable("businesses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /**
   * Mission 027 (correction) — only "auto" exists today; see
   * conversion/domain/vertical.ts. Mission 028 confirmed this is
   * already the vertical abstraction Section 12 asks for — reused
   * as-is, not replaced.
   */
  vertical: text("vertical").notNull().default("auto"),
  /**
   * Mission 028 — the three-way distinction Section 13 asks for
   * ("has_existing_website" / "atlas_provided_website" / "no_website"),
   * replacing M027 (correction)'s boolean `storefrontEnabled` column
   * (dropped in migration 0012 — see that migration for the backfill:
   * storefrontEnabled=true became "atlas_hosted", false became
   * "none"). A boolean couldn't represent "has their own site and
   * hasn't turned on Atlas's" vs. "has no site at all" as two
   * different states, which Section 13 explicitly requires — this
   * column can.
   *
   * - "none": no website of any kind yet.
   * - "own_website": the dealer has an existing site; Atlas integrates
   *   with it via the external-integration API (see conversion/).
   * - "atlas_hosted": the dealer uses Atlas's own public storefront
   *   (`/site/[businessId]`) as their website.
   *
   * Domain-validated in conversion/domain/website-mode.ts, not a DB
   * enum — the same "domain validates, DB just stores" split every
   * other status-like column in this schema already follows.
   */
  websiteMode: text("website_mode").notNull().default("none"),
  /**
   * Mission 027 (correction) — null until generated via settings;
   * authorizes the public integration API for this business. Kept
   * regardless of `websiteMode`, since a dealer can hold a key even
   * before deciding how to use it (and revoking is independent of
   * switching modes).
   */
  publicApiKey: text("public_api_key").unique(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

/**
 * Mission 028 — the Commercial Platform's subscription state,
 * deliberately a separate table from `businesses` (and from any
 * future `plan_definitions`/payment-transaction table): Section 10 is
 * explicit that "plan definition", "organization subscription", and
 * "payment transaction" are three different concepts. The plan
 * *definition* (what each tier is called and what it entitles) stays
 * in code — entitlements/domain/plan.ts — the same way `PERMISSIONS`
 * and M027's `PLAN_FEATURES` already lived in code rather than a
 * table, because nothing yet needs those to be admin-editable at
 * runtime. This table is the one thing that's genuinely
 * business-specific, mutable, and time-bound: which plan a business
 * is currently on, whether that subscription is trialing/active/
 * past_due/etc, and (once a real billing provider exists) which
 * provider/customer/subscription IDs it maps to.
 *
 * One row per business (`businessId` is unique) — Atlas doesn't
 * support multiple concurrent subscriptions per business today, and
 * nothing in this mission needed that generality.
 */
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    /** One of entitlements/domain/plan.ts's SUBSCRIPTION_PLANS — validated at the domain boundary, not a DB enum. */
    plan: text("plan").notNull().default("starter"),
    /** One of entitlements/domain/subscription.ts's SubscriptionStatus values. */
    status: text("status").notNull().default("active"),
    trialEndsAt: text("trial_ends_at"),
    currentPeriodStart: text("current_period_start"),
    currentPeriodEnd: text("current_period_end"),
    cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
      .notNull()
      .default(false),
    /**
     * Mission 028 — Section 15's billing boundary: these four columns
     * are the *only* place a future payment provider's identifiers
     * would live, and every one is nullable because no provider is
     * connected yet (Section 21 — no Stripe/M-Pesa integration in this
     * mission). Nothing else in the subscription domain reads or
     * writes these — they exist so a future BillingAdapter has
     * somewhere to persist its own state without a schema change, not
     * because anything populates them today.
     */
    provider: text("provider"),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    providerStatus: text("provider_status"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [uniqueIndex("subscriptions_business_id_unique").on(table.businessId)]
);

export type BusinessRow = typeof businesses.$inferSelect;
export type NewBusinessRow = typeof businesses.$inferInsert;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type NewSubscriptionRow = typeof subscriptions.$inferInsert;

/**
 * A user belongs to exactly one business. `passwordHash` is never a
 * plaintext password — see src/features/auth/lib/password.ts, which
 * hashes with Node's built-in scrypt (memory-hard, zero extra
 * dependency, avoids the native-binding install risk that sank
 * Prisma in Mission 006). `role` is a centralized, minimal owner/staff
 * distinction — the foundation for real permissions later, not a
 * permissions system itself.
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // A login identifier, unlike customer contact info (Mission 010) —
    // this genuinely must be unique.
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("staff"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("users_business_id_idx").on(table.businessId)]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/**
 * Server-side session store — the session token itself is the primary
 * key (a high-entropy random string, never guessable), handed to the
 * browser only as an httpOnly cookie value. Looking a token up here is
 * the only way to resolve it to a user; a stolen cookie can't be
 * decoded/forged the way a self-contained JWT could, and a session can
 * be revoked immediately (delete the row) rather than waiting out a
 * token's expiry.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;

/**
 * Mission 031 — one AI-drafted marketing write-up per inventory item.
 * Deliberately keyed by (businessId, itemType, itemId) rather than a
 * foreign key straight to `vehicles` or `furniture_products`: Section
 * 12 explicitly forbids `AutoMarketingSystem`/`FurnitureMarketingSystem`,
 * so this table (and everything in features/marketing/) stays
 * vertical-agnostic, resolving the actual item through a small
 * per-vertical adapter (marketing/domain/item-adapter.ts) the same
 * way conversion/domain/catalog-adapter.ts already does for the
 * storefront. One row per item — regenerating replaces the previous
 * draft rather than keeping a history (Section 7: "smallest useful
 * real workflow", not a content-versioning system).
 *
 * `sourceUpdatedAt` is a snapshot of the inventory item's own
 * `updatedAt` at generation time — Section 13's "if inventory
 * information changes, generated content should be regenerated or
 * reviewed rather than silently retaining stale facts." Comparing
 * this snapshot to the item's current `updatedAt` (done in
 * domain/marketing-content.ts's `isContentStale`) is what flags a
 * draft as stale; nothing here re-fetches the item to check.
 */
export const marketingContent = sqliteTable(
  "marketing_content",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    /** "vehicle" | "furniture_product" — see marketing/domain/marketing-item-ref.ts. */
    itemType: text("item_type").notNull(),
    itemId: text("item_id").notNull(),
    /** "ai" if a configured Anthropic API key produced this, "template" if it was assembled deterministically without a model call (Mission 031, Section 17 — the AI path itself is never silently simulated; this is the honest record of which one ran). */
    generationMethod: text("generation_method").notNull(),
    socialCaption: text("social_caption").notNull(),
    whatsappMessage: text("whatsapp_message").notNull(),
    /** JSON snapshot of the exact GroundedFacts passed to the generator — an audit trail proving what the copy was and wasn't allowed to know about. */
    groundedFactsJson: text("grounded_facts_json").notNull(),
    sourceUpdatedAt: text("source_updated_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("marketing_content_business_id_idx").on(table.businessId),
    // One active draft per item — also the lookup this whole feature does most (getContent(businessId, itemType, itemId)).
    uniqueIndex("marketing_content_item_unique").on(table.businessId, table.itemType, table.itemId),
  ]
);

export type MarketingContentRow = typeof marketingContent.$inferSelect;
export type NewMarketingContentRow = typeof marketingContent.$inferInsert;

/**
 * Mission 031, Section 15 — one row per (business, channel),
 * recording only what the UI needs to render an honest connection
 * state. Deliberately no raw access token column: connecting a real
 * Meta/WhatsApp account requires a per-business OAuth exchange this
 * mission builds the boundary for (see marketing/channels/) but that
 * has no real Meta app registered in this environment to complete
 * against — see that module's doc comment. If a future mission wires
 * real OAuth, the token belongs in a column only ever read by the
 * provider adapter server-side, never selected by any query path the
 * UI/actions layer uses (mirroring how `subscriptions`' `provider*`
 * columns are read only by the billing boundary, never the settings UI).
 */
export const marketingChannelConnections = sqliteTable(
  "marketing_channel_connections",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    /** "meta" | "whatsapp" — see marketing/domain/marketing-channel.ts. */
    channel: text("channel").notNull(),
    /** "not_connected" | "connected" | "needs_attention" | "configuration_error" — see domain/marketing-channel.ts's ConnectionStatus. */
    status: text("status").notNull().default("not_connected"),
    /** Human-readable label only (e.g. a page name) — never the credential itself. Null until a real connection exists. */
    externalAccountLabel: text("external_account_label"),
    /**
     * The OAuth access token for this business's connected account,
     * when one exists. Server-only: `DatabaseMarketingChannelRepository`
     * is the only code that ever selects this column — the domain
     * `MarketingChannelConnection` type returned to actions/UI has no
     * field for it (same discipline `subscriptions.provider*`
     * already uses). No real OAuth exchange can complete against this
     * environment (see channels/meta-channel-provider.ts's doc
     * comment), so this column is null in practice here, but the
     * column exists so the publish boundary is genuinely complete
     * rather than structurally unable to hold a real credential.
     */
    accessToken: text("access_token"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("marketing_channel_connections_business_id_idx").on(table.businessId),
    uniqueIndex("marketing_channel_connections_business_channel_unique").on(table.businessId, table.channel),
  ]
);

export type MarketingChannelConnectionRow = typeof marketingChannelConnections.$inferSelect;
export type NewMarketingChannelConnectionRow = typeof marketingChannelConnections.$inferInsert;

/**
 * Mission 031, Section 7/16/17 — one row per publish *attempt*
 * (unlike `marketingContent`, this is a history, not a single mutable
 * row: a dealer can legitimately retry a failed publish, and each
 * attempt is its own auditable record). `isSimulated` is a real
 * boolean column, not inferred from `status`, specifically so no
 * future query can accidentally conflate a simulated and a real
 * publication by only checking status — Section 17's "must make it
 * impossible or difficult to confuse simulation with real delivery"
 * applies to the data model, not only the UI copy.
 */
export const marketingPublications = sqliteTable(
  "marketing_publications",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    marketingContentId: text("marketing_content_id")
      .notNull()
      .references(() => marketingContent.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    /** "simulated" | "published" | "failed". */
    status: text("status").notNull(),
    isSimulated: integer("is_simulated", { mode: "boolean" }).notNull(),
    /** The provider's own post/message id — only ever set for a real, non-simulated success. */
    externalId: text("external_id"),
    /** Present only on status "failed" — a message safe to show the dealer (never a raw provider error body, which can contain internal detail). */
    errorMessage: text("error_message"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("marketing_publications_business_id_idx").on(table.businessId),
    index("marketing_publications_content_id_idx").on(table.marketingContentId),
  ]
);

export type MarketingPublicationRow = typeof marketingPublications.$inferSelect;
export type NewMarketingPublicationRow = typeof marketingPublications.$inferInsert;

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Authentication & Authorization

**Dev login:** `owner@atlas.dev` / `atlas-dev-2026` (seeded by `scripts/backfill-business-ownership.ts`, idempotent).

Atlas uses DB-backed sessions (opaque token, httpOnly cookie) — not JWT. `requireCurrentSession()` (`src/features/auth/lib/current-session.ts`) is the single boundary every protected page and every mutating server action calls through; it resolves the session against the database and redirects to `/login` if it's missing or expired. Route handlers that aren't pages (e.g. the photo-serving route below) use the non-redirecting `getCurrentSession()` instead and return a plain 404.

**Roles.** There are exactly two: `owner` and `staff`. Owner has full business-management permissions; staff can perform normal dealership operations but not destructive or administrative ones.

| Capability             | Owner | Staff | Exists? |
| ----------------------- | :---: | :---: | :---: |
| View dashboard          |   ✓   |   ✓   | ✓ |
| View / search inventory |   ✓   |   ✓   | ✓ |
| Create / edit vehicle   |   ✓   |   ✓   | ✓ |
| Change vehicle status   |   ✓   |   ✓   | ✓ |
| **Delete vehicle**      | **✓** | **✗** | ✓ |
| Manage vehicle photos (upload/reorder/set primary/delete) |   ✓   |   ✓   | ✓ |
| Create / edit customer  |   ✓   |   ✓   | ✓ |
| Delete customer         |   —   |   —   | not built |
| Create / edit lead      |   ✓   |   ✓   | ✓ |
| Delete lead             |   —   |   —   | not built |
| User management (read/create/update/delete/role change) | — | — | not built |
| Business settings       |   —   |   —   | not built (placeholder page) |

`—` = capability doesn't exist in Atlas yet, so there's nothing for a permission to guard. Mission 014 (see its report) re-audited the whole codebase against this exact question for every row above and found the same answer Mission 013 did: no other destructive/admin operation exists, so `vehicle.delete` remains the only defined permission. Vehicle photo management stays intentionally ungated for staff — it's routine inventory upkeep, not a business-critical/destructive action, matching the baseline policy both missions worked from.

**Enforcement.** Authorization is checked server-side, in the server action, immediately after `requireCurrentSession()` and before the service is ever called:

```
Server Action → requireCurrentSession() → requirePermission() → Service → Business-scoped Repository → DB
```

The permission table lives in one place, `src/features/auth/domain/permissions.ts` (`hasPermission` / `requirePermission` / `ForbiddenError`), rather than scattered `role === "owner"` checks. UI controls (e.g. the delete-vehicle button) hide themselves based on the same check, but that's a UX convenience only — the server-side check is what actually blocks the operation, and holds even if a request bypasses the UI entirely.

Authorization is a separate concern from business (tenant) isolation, which remains enforced independently at the repository layer via `businessId` scoping (see Mission 012). Both protections apply on every mutation: a staff member is rejected regardless of whose data they target, and an owner is confined to their own business's data regardless of role.

**Vehicle photo files.** Served through `src/app/uploads/vehicles/[vehicleId]/[filename]/route.ts` rather than as static assets. Mission 014's audit found this route had no session check and no business scoping at all — any valid photo URL was fetchable by anyone, signed in or not, from any business. It's since been fixed to require a session and to resolve the vehicle through the same business-scoped `VehicleService` every other feature uses before touching the filesystem; a vehicle from another business now resolves to nothing. Browsers send the session cookie automatically on same-origin `<img>` requests, so this needed no client-side change.

**Testing the boundary directly.** Every server action here calls `next/headers`'s `cookies()`, which throws outside a real Next.js request — Mission 013 worked around this by reimplementing each action's authorization logic inline in its tests. Mission 014 found that `cookies()` and `next/cache`'s `revalidatePath()` are both thin enough to mock safely (see `src/test-support/`), which means tests can now call the actual exported action functions directly against a real SQLite database, proving the production boundary itself rather than a reimplementation of it.

## Lead Pipeline (Mission 015)

A Lead represents **a customer's active commercial interest in acquiring a vehicle** — not a completed sale. There is deliberately no Deal/Sale/payment domain yet; that's future scope.

**Statuses**: `new → contacted → qualified → negotiating → won | lost`. `won`/`lost` are terminal; the other four are active. **`won` means "successful sales opportunity", never "vehicle sold"** — reaching `won` never changes vehicle status automatically. The point at which a vehicle becomes `sold` belongs to a future Deal/Sale mission.

**Transitions** stay deliberately permissive — any active status can move to any other active status or to either terminal status, and either terminal status can be reopened back to active (staff must be able to correct mistakes; a walk-in can jump straight from `new` to `won`). The one restriction: **`won` and `lost` cannot be swapped directly** — reopen to an active status first. This is enforced server-side in `LeadService.updateLeadStatus`, not just hidden in the UI.

**Follow-up tracking**: `nextFollowUpAt` (staff-set, optional) and `lastContactedAt` (auto-stamped on every status transition, never client-settable) — the Leads page has a "Needs follow-up" filter and highlights overdue dates.

**Creating leads**: no longer tied to a vehicle's page only — `CreateLeadDialog` supports an optional preset customer and/or vehicle, so a lead can be created from the Leads page (pick both), a customer's page (customer preset), or a vehicle's page (vehicle preset, unchanged from Mission 011).

**Business rules unchanged from Mission 011/012/014**: a lead's customer and (if set) vehicle must belong to the caller's business; deleting a vehicle nulls `vehicleId` but preserves `vehicleLabel` as a historical snapshot; all reads/writes are business-scoped through the same repository pattern. Duplicate-lead detection, lead assignment/ownership, and a full activity/event log were all considered and explicitly **not** built — none were confidently justified by the current domain; see the Mission 015 report for the reasoning.

## Customer CRM (Mission 016)

The customer detail page (`/app/customers/[id]`) is the CRM hub: contact info, a lead summary row (total/active/won/lost + next follow-up), a **Vehicles of interest** section, and the full lead list — all derived from the customer's existing leads, no new relationship or query added.

**Vehicles of interest** means exactly that — *interest*, not ownership. A vehicle shows up here because a lead references it, grouped by vehicle (or by the historical `vehicleLabel` once the vehicle's been deleted, same snapshot behavior as everywhere else). Atlas still has no purchase/ownership concept; that's future Deal/Sale scope, not this mission's.

**Lead creation from a customer page** uses the same `CreateLeadDialog` from Mission 015 with `customerId` preset — the customer picker is never rendered in that case, so there's no way to swap in a different (let alone foreign-business) customer client-side, and the server independently re-validates the customer through the business-scoped path regardless.

**Customer deletion does not exist**, unchanged from Mission 013/014's findings — there was no existing, clearly-correct policy to build on, so Mission 016 didn't invent one. Everything else about the Customer model (search across name/phone/email, pagination, the "at least one contact method" validation rule, editable notes) already met this mission's bar and was left as-is; the changes were additive UI/CRM-view work, not a domain redesign.

## CRM Activity & Follow-up System (Mission 017)

`activities` is Atlas's chronological CRM history — "business memory" for future Sales/Analytics/automation to consume. Every row has a business-scoped `customerId` (always set, even for lead-scoped activities — see the schema comment), an optional `leadId`, a server-derived `userId` (actor), a controlled `type`, plain-text `content`, and optional structured `metadata`.

**Types**: manual (`note, call, meeting, email` — user-selectable) and automatic (`lead_created, status_change, follow_up_scheduled, follow_up_completed` — never client-selectable; runtime-validated, not just TypeScript-typed, so a request can't forge one through the manual-entry path).

**Automatic generation has exactly one owner**: the Lead server actions (`lead-actions.ts`), immediately after each mutation succeeds — never the service layer, never the UI. `LeadService` has no knowledge of `Activity` at all. This is deliberate: one call site per event means no risk of duplicate generation across layers. A `status_change` activity is generated by reading the lead's status *before* the mutation (the service only returns final state) and pairing it with the actor's request; `follow_up_scheduled` fires only when `nextFollowUpAt` actually changes to a new value, not on every edit.

**Follow-up completion** (`LeadService.completeFollowUp` / `completeLeadFollowUpAction`) is a new, explicit mechanism distinguishing *scheduled* (`nextFollowUpAt` set), *completed* (explicitly recorded, clears `nextFollowUpAt` and stamps `lastContactedAt`), and *overdue* (computed: scheduled date has passed) — `nextFollowUpAt` itself is unchanged from Mission 015, not replaced. Completing when nothing is scheduled is rejected, which also naturally prevents duplicate completion.

**Activities are immutable** — no update or delete path exists. Corrections are explicitly deferred future scope, not built casually.

**Timelines are one shared component** (`ActivityTimeline`), used by both the Customer and Lead detail pages — not duplicated. A customer's timeline is a single `WHERE customer_id = ?` query (no join through leads needed, since `customerId` is always denormalized onto every activity row) and includes every activity from all of that customer's leads.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

import type { CurrentSession } from "../lib/current-session";
import type { UserRole } from "./user";

/**
 * The full set of permissions Atlas currently enforces. Deliberately
 * scoped to operations that actually exist in the codebase as of
 * Mission 013 — no customer.delete, lead.delete, or user.* here,
 * because there is no delete-customer, delete-lead, or
 * user-management code path for them to guard yet (see Mission 013
 * report, "Known Limitations"). Add a permission here only when the
 * operation it guards exists.
 *
 * - sale.create — Mission 019. Finalizing a Sale is the single most
 *   consequential write in Atlas: it's the one operation designed to be
 *   effectively immutable and to remain trustworthy for historical
 *   revenue/analytics reporting (see SaleService). That's a stronger
 *   case for restriction than vehicle.delete's "destructive" rationale,
 *   not a weaker one, so it follows the same owner-only pattern.
 * - business.manage — Mission 027 (correction). Changing the
 *   business's own conversion-layer settings (turning the public
 *   storefront on/off, rotating the external-integration API key) is
 *   an account-level configuration change with real customer-facing
 *   consequences (a stale/leaked API key stays live until someone
 *   rotates it; the storefront going live is a public-facing change),
 *   so it follows the same owner-only pattern as every other
 *   consequential/irreversible action here.
 * - furniture_product.delete — Mission 030. Identical rationale to
 *   vehicle.delete: a destructive, irreversible inventory operation,
 *   restricted the same way for the same reason.
 */
export const PERMISSIONS = [
  "vehicle.delete",
  "sale.create",
  "business.manage",
  "furniture_product.delete",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Central role → permission map. Every permission not listed for a
 * role is implicitly denied — this is a small allowlist, not a
 * framework, per Mission 013's "keep it lean" instruction. Owner is
 * intentionally spelled out in full (rather than "everything") so
 * this table stays the one place both roles' capabilities are
 * legible at a glance.
 */
const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  staff: new Set([]),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/**
 * Thrown by requirePermission. Actions catch this and translate it
 * into their own feature's existing ServiceResult error shape (e.g.
 * VehicleServiceError with code "FORBIDDEN") rather than letting it
 * propagate as an unhandled rejection — see vehicle-actions.ts.
 */
export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * The single authoritative authorization check. Called right after
 * requireCurrentSession() in a server action, before the service is
 * ever reached:
 *
 *   Server Action → requireCurrentSession() → requirePermission() → Service
 *
 * Takes the resolved CurrentSession (not raw role/businessId strings)
 * so the check always operates on server-derived values — nothing
 * client-supplied ever reaches this function.
 */
export function requirePermission(
  session: CurrentSession,
  permission: Permission
): void {
  if (!hasPermission(session.user.role, permission)) {
    throw new ForbiddenError();
  }
}

/**
 * Mission 022 — Section 4/9. A bounded reference to a real domain
 * record, resolved through the existing business-scoped repositories
 * — never a raw database row, and never more fields than the UI
 * actually needs (Section 4: "return only fields genuinely required
 * by the intelligence layer/UI").
 *
 * `href` always points at an existing Atlas route (Section 12: "do
 * not invent routes that do not exist") — /app/leads/[id],
 * /app/deals/[id], or (Mission 026) /app/inventory/[id], all of which
 * already enforce the same session/business-scoping every other
 * detail page does. Following the link re-runs that page's own
 * authorization; nothing here grants access, it's just a navigation
 * target.
 */
export type AffectedEntityType = "lead" | "deal" | "vehicle";

export type AffectedEntity = {
  type: AffectedEntityType;
  id: string;
  label: string;
  href: string;
};

import type { ActivityMetadata, ActivityType } from "./activity";

/**
 * Internal — used by ActivityService.createActivity, called only from
 * trusted server code (actions) that has already resolved the
 * authenticated actor and validated the customer/lead relationship.
 * Not exposed as a public "create any activity" input, since `type`
 * here is unrestricted (automatic types included) — the manual-entry
 * path (CreateManualActivityInput below) is the client-facing one.
 */
export type CreateActivityInput = {
  customerId: string;
  leadId?: string | null;
  userId: string;
  type: ActivityType;
  content: string;
  metadata?: ActivityMetadata;
};

/** The client-facing shape — deliberately narrower than CreateActivityInput. No userId (server-derived), type restricted to ManualActivityType by the service. */
export type CreateManualActivityInput = {
  customerId: string;
  leadId?: string | null;
  type: string;
  content: string;
};

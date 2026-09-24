import type { Activity } from "../domain/activity";
import type { CreateActivityInput } from "../domain/activity-input";
import type { ActivityQuery, PaginatedActivityResult } from "../domain/activity-query";

export interface ActivityRepository {
  createActivity(input: CreateActivityInput): Promise<Activity>;
  getActivityById(id: string): Promise<Activity | null>;
  /** Business-scoped, chronological (newest first), paginated. Powers both customer and lead timelines via `query.customerId`/`query.leadId`. */
  getActivitiesPaged(query: ActivityQuery): Promise<PaginatedActivityResult<Activity>>;
  /**
   * Mission 023 — training-only. Every activity for the given leads,
   * chronologically ascending, up to (and including) `upTo`. Batched
   * across many leads in one query specifically so dataset
   * construction never does one query per lead (Section 14's "no
   * N+1" applies to training too, even though training isn't on the
   * live request path). Never called from a request handler — see
   * predictive/lead-conversion/dataset-builder.ts.
   */
  getActivitiesForLeads(leadIds: string[], upTo: string): Promise<Activity[]>;
}

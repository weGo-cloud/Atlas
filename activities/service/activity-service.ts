import type { CustomerRepository } from "@/features/customers/repository/customer-repository";
import type { LeadRepository } from "@/features/leads/repository/lead-repository";
import type { Activity, ActivityType } from "../domain/activity";
import type { CreateActivityInput, CreateManualActivityInput } from "../domain/activity-input";
import type { ActivityQuery, PaginatedActivityResult } from "../domain/activity-query";
import { validateCreateManualActivityInput } from "../domain/validate-activity-input";
import { failActivity, okActivity, type ActivityResult } from "../domain/errors";
import type { ActivityRepository } from "../repository/activity-repository";

/**
 * Mission 017 — the one place that creates activities. Both the
 * manual-entry path (createManualActivity, client-facing types only)
 * and the internal path used by server actions for automatic events
 * (createActivity, any ActivityType) funnel through the same
 * relationship checks below, so there's no way to end up with an
 * activity whose customer/lead don't actually match or don't belong
 * to the caller's business — regardless of which path created it.
 */
export class ActivityService {
  constructor(
    private readonly repository: ActivityRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly leadRepository: LeadRepository
  ) {}

  /**
   * Internal/trusted entry point — `type` is unrestricted (automatic
   * types included). Callers are server actions that have already
   * resolved the authenticated actor; `input.userId` is never taken
   * from client input by this method's callers.
   */
  async createActivity(input: CreateActivityInput): Promise<ActivityResult<Activity>> {
    const content = input.content.trim();
    if (!content) {
      return failActivity({
        code: "VALIDATION_ERROR",
        message: "Content is required.",
        fieldErrors: { content: "Content is required." },
      });
    }

    const customer = await this.customerRepository.getCustomerById(input.customerId);
    if (!customer) {
      return failActivity({ code: "CUSTOMER_NOT_FOUND", message: "Customer was not found." });
    }

    if (input.leadId) {
      const lead = await this.leadRepository.getLeadById(input.leadId);
      if (!lead) {
        return failActivity({ code: "LEAD_NOT_FOUND", message: "Lead was not found." });
      }
      if (lead.customerId !== input.customerId) {
        return failActivity({
          code: "LEAD_CUSTOMER_MISMATCH",
          message: "This lead does not belong to the given customer.",
        });
      }
    }

    const created = await this.repository.createActivity({
      customerId: input.customerId,
      leadId: input.leadId ?? null,
      userId: input.userId,
      type: input.type,
      content,
      metadata: input.metadata ?? null,
    });
    return okActivity(created);
  }

  /** Client-facing entry point — `type` is validated against MANUAL_ACTIVITY_TYPES only, so a request can never forge an automatic type (status_change, lead_created, etc.) through this path. `actorUserId` always comes from the caller's resolved session, never from `input`. */
  async createManualActivity(
    input: CreateManualActivityInput,
    actorUserId: string
  ): Promise<ActivityResult<Activity>> {
    const fieldErrors = validateCreateManualActivityInput(input);
    if (Object.keys(fieldErrors).length > 0) {
      return failActivity({
        code: "VALIDATION_ERROR",
        message: "Please fix the highlighted fields.",
        fieldErrors,
      });
    }

    return this.createActivity({
      customerId: input.customerId,
      leadId: input.leadId ?? null,
      userId: actorUserId,
      type: input.type as ActivityType,
      content: input.content,
    });
  }

  async getActivitiesForCustomer(
    customerId: string,
    query: Omit<ActivityQuery, "customerId" | "leadId"> = {}
  ): Promise<PaginatedActivityResult<Activity>> {
    return this.repository.getActivitiesPaged({ ...query, customerId });
  }

  async getActivitiesForLead(
    leadId: string,
    query: Omit<ActivityQuery, "customerId" | "leadId"> = {}
  ): Promise<PaginatedActivityResult<Activity>> {
    return this.repository.getActivitiesPaged({ ...query, leadId });
  }
}

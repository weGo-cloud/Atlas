import { DatabaseBusinessRepository } from "@/features/auth/repository/database-business-repository";
import type { Business } from "@/features/auth/domain/business";
import { FurnitureAssistantCatalog } from "../catalog/furniture-assistant-catalog";
import type { AssistantCatalog } from "../domain/catalog";
import type { AssistantRepository, LeadHandoff } from "../domain/ports";
import type { AssistantSettings, TurnResult } from "../domain/types";
import { AssistantEngine, type TurnInput } from "../engine/assistant-engine";
import { getLlmClient } from "../llm/anthropic-llm-client";
import type { LlmClient } from "../llm/llm-client";
import { DatabaseAssistantRepository } from "../repository/database-assistant-repository";
import { ServiceLeadHandoff } from "./lead-handoff";
import { businessDailyCap, nextUtcDayStart, readAiUsage, reserveAiCall } from "@/lib/ai/spend-guard";
import { effectiveLimitFor } from "@/features/entitlements/domain/plan";
import { getEntitlementService } from "@/features/entitlements/service";
import type { EntitlementService } from "@/features/entitlements/service/entitlement-service";

/** One catalog per `businesses.vertical` — adding Auto later is one entry here plus one AssistantCatalog implementation. */
const CATALOG_FACTORIES: Record<string, (businessId: string) => AssistantCatalog> = {
  furniture: (businessId) => new FurnitureAssistantCatalog(businessId),
};

export type UnavailableReason = "business_not_found" | "unsupported_vertical" | "disabled" | "not_configured" | "limit_reached" | "not_in_plan";

export type Availability = { available: true } | { available: false; reason: UnavailableReason };

export type AssistantServiceDeps = {
  llm?: LlmClient | null;
  repository?: AssistantRepository;
  handoff?: LeadHandoff;
  catalogFactory?: (businessId: string) => AssistantCatalog;
  /** Mission 038 — plan/quota source; defaults to the real EntitlementService. */
  entitlements?: EntitlementService;
};

/** Mission 038 — what the business's plan allows the customer assistant to do right now. */
export type AssistantAllowance = { allowed: boolean; dailyCap: number };

export class AssistantService {
  private readonly repository: AssistantRepository;
  private readonly handoff: LeadHandoff;
  private readonly llm: LlmClient | null;

  constructor(
    readonly businessId: string,
    private readonly deps: AssistantServiceDeps = {}
  ) {
    this.repository = deps.repository ?? new DatabaseAssistantRepository(businessId);
    this.handoff = deps.handoff ?? new ServiceLeadHandoff(businessId);
    this.llm = deps.llm === undefined ? getLlmClient() : deps.llm;
  }

  /**
   * Mission 038 — plan gate + daily quota. The assistant needs the "assistant" capability (Growth, Pro or an
   * active trial — never the free Starter plan), and its daily customer-message cap is the plan's own limit
   * (lowered while on a trial), further bounded by the operator's AI_DAILY_CAP_PER_BUSINESS ceiling.
   * No subscription or an inactive one means no AI and no cost.
   */
  async getAllowance(now: Date = new Date()): Promise<AssistantAllowance> {
    const entitlements = this.deps.entitlements ?? getEntitlementService();
    const access = await entitlements.canAccess(this.businessId, "assistant", now);
    if (!access.allowed) return { allowed: false, dailyCap: 0 };
    const effective = await entitlements.getEffectiveSubscription(this.businessId, now);
    if (!effective) return { allowed: false, dailyCap: 0 };
    const planCap = effectiveLimitFor(effective.subscription.plan, effective.subscription.status, "assistant_messages_daily");
    return { allowed: true, dailyCap: Math.min(planCap ?? businessDailyCap(), businessDailyCap()) };
  }

  /** Today's (UTC) customer-assistant usage against the cap — for the owner's usage meter. */
  async getUsageToday(now: Date = new Date()): Promise<{ used: number; cap: number; resetsAt: string }> {
    const allowance = await this.getAllowance(now);
    return { used: await readAiUsage(`biz:${this.businessId}`, now), cap: allowance.dailyCap, resetsAt: nextUtcDayStart(now).toISOString() };
  }

  get repo(): AssistantRepository {
    return this.repository;
  }

  private async getBusiness(): Promise<Business | null> {
    return new DatabaseBusinessRepository().getById(this.businessId);
  }

  private catalogFor(business: Business): AssistantCatalog | null {
    const factory = this.deps.catalogFactory ?? CATALOG_FACTORIES[business.vertical];
    return factory ? factory(business.id) : null;
  }

  /** Whether customers can chat with the assistant right now — the widget and channels both key off this. No API key means unavailable: nothing pretends to be AI. */
  async getAvailability(): Promise<Availability> {
    const business = await this.getBusiness();
    if (!business) return { available: false, reason: "business_not_found" };
    if (!this.catalogFor(business)) return { available: false, reason: "unsupported_vertical" };
    if (!(await this.getAllowance()).allowed) return { available: false, reason: "not_in_plan" };
    const settings = await this.repository.getSettings();
    if (!settings.assistantEnabled) return { available: false, reason: "disabled" };
    if (!this.llm) return { available: false, reason: "not_configured" };
    return { available: true };
  }

  async getGreeting(): Promise<string> {
    const business = await this.getBusiness();
    const settings = await this.repository.getSettings();
    if (settings.greeting?.trim()) return settings.greeting.trim();
    const name = settings.displayName || business?.name || "our";
    return `Hi! I'm the ${name} virtual assistant. Tell me what you're looking for and I'll find pieces that fit.`;
  }

  async getSettings(): Promise<AssistantSettings> {
    return this.repository.getSettings();
  }

  async handleCustomerMessage(input: TurnInput): Promise<{ ok: true; result: TurnResult } | { ok: false; reason: UnavailableReason }> {
    const business = await this.getBusiness();
    if (!business) return { ok: false, reason: "business_not_found" };
    const catalog = this.catalogFor(business);
    if (!catalog) return { ok: false, reason: "unsupported_vertical" };
    const allowance = await this.getAllowance();
    if (!allowance.allowed) return { ok: false, reason: "not_in_plan" };
    const settings = await this.repository.getSettings();
    if (!settings.assistantEnabled) return { ok: false, reason: "disabled" };
    if (!this.llm) return { ok: false, reason: "not_configured" };
    // Mission 037/038 — per-business daily cap on customer messages (the plan's allowance, bounded by the operator ceiling): the storefront chat is public/unauthenticated, so this bounds what any one business (or a bot targeting it) can spend.
    if (!(await reserveAiCall(`biz:${this.businessId}`, allowance.dailyCap))) return { ok: false, reason: "limit_reached" };

    const engine = new AssistantEngine({
      llm: this.llm,
      catalog,
      repository: this.repository,
      handoff: this.handoff,
      settings,
      businessName: business.name,
    });
    return { ok: true, result: await engine.handleTurn(input) };
  }
}

export function getAssistantService(businessId: string, deps?: AssistantServiceDeps): AssistantService {
  return new AssistantService(businessId, deps);
}

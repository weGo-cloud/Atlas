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

/** One catalog per `businesses.vertical` — adding Auto later is one entry here plus one AssistantCatalog implementation. */
const CATALOG_FACTORIES: Record<string, (businessId: string) => AssistantCatalog> = {
  furniture: (businessId) => new FurnitureAssistantCatalog(businessId),
};

export type UnavailableReason = "business_not_found" | "unsupported_vertical" | "disabled" | "not_configured";

export type Availability = { available: true } | { available: false; reason: UnavailableReason };

export type AssistantServiceDeps = {
  llm?: LlmClient | null;
  repository?: AssistantRepository;
  handoff?: LeadHandoff;
  catalogFactory?: (businessId: string) => AssistantCatalog;
};

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
    const settings = await this.repository.getSettings();
    if (!settings.assistantEnabled) return { ok: false, reason: "disabled" };
    if (!this.llm) return { ok: false, reason: "not_configured" };

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

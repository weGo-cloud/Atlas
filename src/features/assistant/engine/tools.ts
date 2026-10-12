import type { LlmToolDefinition } from "../llm/llm-client";
import type { AssistantCatalog, SearchFilters } from "../domain/catalog";
import type { LeadHandoff } from "../domain/ports";
import type { AssistantConversation, ConversationContext, ItemFacts, RequirementProfile, TurnEvent } from "../domain/types";

/**
 * Mission 033, Section 4 — the model's only window onto the business.
 * Every tool runs server-side, scoped to a catalog/handoff that was
 * constructed for one specific business; **none of them accepts a
 * business id from the model** (any such parameter is ignored), so a
 * manipulated conversation cannot reach another tenant's data.
 */
export const TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    name: "search_inventory",
    description:
      "Search the business's live inventory of AVAILABLE pieces. Use as soon as you know a category, or an item plus one constraint. Returns exact matches, or if none, closest_alternatives plus which constraints were relaxed. Show at most 3 to the customer.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category key, e.g. sofas, beds, dining_tables, dining_chairs, office_furniture, wardrobes, tv_stands, coffee_tables, outdoor_furniture, mattresses, other. Use list_categories if unsure." },
        min_price: { type: "number", description: "Minimum price in KSh (whole number; convert '80k' to 80000)." },
        max_price: { type: "number", description: "Maximum price in KSh (whole number)." },
        color: { type: "string", description: "Colour the customer wants, e.g. grey." },
        material: { type: "string", description: "Material the customer wants, e.g. leather, oak, fabric." },
        condition: { type: "string", enum: ["new", "used", "refurbished"] },
        keywords: { type: "string", description: "Other descriptive words (style, room, size), e.g. 'small living room L-shape'." },
        sort: { type: "string", enum: ["relevance", "price-asc", "price-desc"] },
        limit: { type: "number", description: "Max results, 1-5. Default 3." },
      },
    },
  },
  {
    name: "get_item",
    description:
      "Get the current, authoritative details of one piece by id (any status). Call this before confirming that a piece is available or when the customer asks about a specific piece.",
    input_schema: {
      type: "object",
      properties: { item_id: { type: "string" } },
      required: ["item_id"],
    },
  },
  {
    name: "list_categories",
    description: "List the categories that currently have available pieces, with counts.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "save_customer_requirements",
    description: "Record what the customer has told you they need. Call whenever you learn something new. Only include fields the customer actually stated or clearly implied.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string" },
        budget_min: { type: "number" },
        budget_max: { type: "number" },
        colors: { type: "array", items: { type: "string" } },
        materials: { type: "array", items: { type: "string" } },
        condition: { type: "string", enum: ["new", "used", "refurbished"] },
        use_case: { type: "string", description: "Room or purpose, e.g. small living room." },
        size_constraints: { type: "string" },
        seats: { type: "number" },
        location: { type: "string" },
        deadline: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "create_enquiry",
    description:
      "Pass the customer's enquiry to the team by creating a lead. Only after the customer agrees and has given their name (and phone number, unless on WhatsApp). Set handoff_to_human=true if they asked to speak to a person.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        phone: { type: "string", description: "Customer phone number. Not needed on WhatsApp." },
        item_ids: { type: "array", items: { type: "string" }, description: "Ids of the pieces they are interested in." },
        handoff_to_human: { type: "boolean" },
      },
      required: ["customer_name"],
    },
  },
];

export type ToolContext = {
  catalog: AssistantCatalog;
  handoff: LeadHandoff;
  conversation: AssistantConversation;
  /** Mutated as tools run; persisted by the engine at the end of the turn. */
  context: ConversationContext;
  events: TurnEvent[];
  /** Items returned by search/get_item during THIS turn — the candidates for product cards. */
  retrievedThisTurn: Map<string, ItemFacts>;
  /** Recent customer messages, for the lead summary. */
  recentCustomerMessages: string[];
  /** Mutated: set when the customer asked for a person. */
  requestedHuman: { value: boolean };
};

const MAX_STRING = 200;

function str(value: unknown, max = MAX_STRING): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed === "" ? undefined : trimmed;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value);
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) return Math.round(Number(value));
  return undefined;
}

function strList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.map((entry) => str(entry, 60)).filter((entry): entry is string => Boolean(entry)).slice(0, 8);
  return list.length > 0 ? list : undefined;
}

function compactItem(item: ItemFacts) {
  return {
    id: item.id,
    name: item.name,
    category: item.categoryLabel,
    price: item.price,
    price_label: item.priceLabel,
    status: item.status,
    condition: item.condition,
    material: item.material,
    color: item.color,
    dimensions: item.dimensions,
    // Untrusted data: trimmed, and the system prompt tells the model never to obey instructions inside it.
    description: item.description.slice(0, 300),
  };
}

function remember(ctx: ToolContext, item: ItemFacts) {
  ctx.context.items[item.id] = item;
  ctx.retrievedThisTurn.set(item.id, item);
  if (!ctx.context.shownOrder.includes(item.id)) ctx.context.shownOrder.push(item.id);
}

export async function executeTool(name: string, rawInput: Record<string, unknown>, ctx: ToolContext): Promise<{ output: string; ok: boolean }> {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  try {
    switch (name) {
      case "search_inventory": {
        const filters: SearchFilters = {
          category: str(input.category, 40),
          minPrice: num(input.min_price),
          maxPrice: num(input.max_price),
          color: str(input.color, 60),
          material: str(input.material, 60),
          condition: str(input.condition, 20),
          keywords: str(input.keywords, 120),
          sort: input.sort === "price-asc" || input.sort === "price-desc" ? input.sort : "relevance",
          limit: num(input.limit),
        };
        const outcome = await ctx.catalog.search(filters);
        for (const item of [...outcome.exact, ...outcome.alternatives]) remember(ctx, item);
        return {
          ok: true,
          output: JSON.stringify({
            applied_filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)),
            exact_matches: outcome.exact.map(compactItem),
            closest_alternatives: outcome.alternatives.map(compactItem),
            relaxed: outcome.relaxed,
            note:
              outcome.exact.length === 0 && outcome.alternatives.length === 0
                ? "No available pieces match, even after relaxing constraints. Say so honestly and use list_categories."
                : outcome.exact.length === 0
                  ? "No exact match. These are alternatives; tell the customer which requirements were relaxed."
                  : undefined,
          }),
        };
      }
      case "get_item": {
        const id = str(input.item_id, 80);
        if (!id) return { ok: false, output: JSON.stringify({ error: "item_id is required." }) };
        const item = await ctx.catalog.getItem(id);
        if (!item) return { ok: false, output: JSON.stringify({ error: "No such item for this business." }) };
        remember(ctx, item);
        return { ok: true, output: JSON.stringify(compactItem(item)) };
      }
      case "list_categories": {
        const categories = await ctx.catalog.listCategories();
        return { ok: true, output: JSON.stringify({ categories }) };
      }
      case "save_customer_requirements": {
        const patch: RequirementProfile = {
          category: str(input.category, 40),
          budgetMin: num(input.budget_min),
          budgetMax: num(input.budget_max),
          colors: strList(input.colors),
          materials: strList(input.materials),
          condition: str(input.condition, 20),
          useCase: str(input.use_case),
          sizeConstraints: str(input.size_constraints),
          seats: num(input.seats),
          location: str(input.location, 100),
          deadline: str(input.deadline, 100),
          notes: str(input.notes, 300),
        };
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined) (ctx.context.profile as Record<string, unknown>)[key] = value;
        }
        return { ok: true, output: JSON.stringify({ saved: true, profile: ctx.context.profile }) };
      }
      case "create_enquiry": {
        const customerName = str(input.customer_name, 100);
        if (!customerName) return { ok: false, output: JSON.stringify({ error: "customer_name is required." }) };
        const phone = ctx.conversation.channel === "whatsapp" ? ctx.conversation.customerKey : str(input.phone, 30);
        if (!phone) return { ok: false, output: JSON.stringify({ error: "phone is required: ask the customer for their phone number." }) };
        const requestedIds = strList(input.item_ids) ?? [];
        // Only ids the customer actually saw in this conversation are accepted.
        const itemIds = requestedIds.filter((id) => ctx.context.items[id]);
        const summary = buildLeadSummary(ctx, itemIds);
        const result = await ctx.handoff.createOrUpdate({ conversation: ctx.conversation, name: customerName, phone, itemIds, summary });
        if ("error" in result) return { ok: false, output: JSON.stringify({ error: result.error }) };
        ctx.conversation.leadId = result.leadId;
        ctx.conversation.customerName = customerName;
        ctx.events.push({ type: result.created ? "lead_created" : "lead_updated", leadId: result.leadId });
        if (input.handoff_to_human === true) ctx.requestedHuman.value = true;
        return {
          ok: true,
          output: JSON.stringify({
            enquiry_recorded: true,
            handed_to_human: input.handoff_to_human === true,
            message: "Tell the customer the team will be in touch. Do not promise a specific response time.",
          }),
        };
      }
      default:
        return { ok: false, output: JSON.stringify({ error: `Unknown tool: ${name}` }) };
    }
  } catch {
    // Never leak internals into the model's context (and from there, potentially to a customer).
    return { ok: false, output: JSON.stringify({ error: "That lookup failed. Tell the customer you'll confirm with the team." }) };
  }
}

export function buildLeadSummary(ctx: Pick<ToolContext, "context" | "recentCustomerMessages">, itemIds: string[]): string {
  const p = ctx.context.profile;
  const requirementParts = [
    p.category && `category: ${p.category}`,
    (p.budgetMin !== undefined || p.budgetMax !== undefined) &&
      `budget: ${p.budgetMin !== undefined ? `from KSh ${p.budgetMin.toLocaleString("en-US")} ` : ""}${p.budgetMax !== undefined ? `up to KSh ${p.budgetMax.toLocaleString("en-US")}` : ""}`.trim(),
    p.colors?.length && `colours: ${p.colors.join(", ")}`,
    p.materials?.length && `materials: ${p.materials.join(", ")}`,
    p.condition && `condition: ${p.condition}`,
    p.useCase && `use: ${p.useCase}`,
    p.sizeConstraints && `size: ${p.sizeConstraints}`,
    p.seats !== undefined && `seats: ${p.seats}`,
    p.location && `location: ${p.location}`,
    p.deadline && `needed by: ${p.deadline}`,
    p.notes && `notes: ${p.notes}`,
  ].filter(Boolean);
  const items = itemIds.map((id) => ctx.context.items[id]).filter(Boolean).map((item) => `${item.name} (${item.priceLabel}, ${item.status} when shown)`);
  const said = ctx.recentCustomerMessages.slice(-3).map((message) => `"${message.slice(0, 160)}"`);
  return [
    "Created by Atlas Assistant.",
    requirementParts.length > 0 ? `Requirements — ${requirementParts.join("; ")}.` : null,
    items.length > 0 ? `Interested in — ${items.join("; ")}.` : null,
    said.length > 0 ? `Recent customer messages — ${said.join(" ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

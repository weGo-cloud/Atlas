import { BULK_ACTION_CAP, MAX_PRICE_PERCENT_CHANGE, SEARCH_RESULT_LIMIT } from "./thresholds";
import { INVENTORY_STATUSES, type FieldSpec, type InventoryAdapter } from "./inventory-types";

/** The shape the Anthropic Messages API expects for a tool. */
export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
};

function fieldProperties(specs: readonly FieldSpec[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const spec of specs) {
    properties[spec.name] = {
      type: spec.type,
      description: spec.description,
      ...(spec.enum ? { enum: [...spec.enum] } : {}),
    };
  }
  return properties;
}

/**
 * The tool set Everest is given for one vertical. Read tools run
 * immediately; write tools only ever *propose* a change — nothing is
 * written until the person confirms on a card. `businessId` is never a
 * parameter of any tool: the model cannot name another tenant.
 */
export function buildToolDefinitions(adapter: InventoryAdapter): ToolDefinition[] {
  const noun = adapter.itemNoun;
  const nouns = adapter.itemNounPlural;
  const bulkFields = adapter.fields.filter((spec) => spec.bulkEditable && spec.name !== "price");

  return [
    {
      name: "search_inventory",
      description: `Look up ${nouns} in this business's stock. Returns at most ${SEARCH_RESULT_LIMIT} matches plus the total count. Use it before answering any question about what is in stock, and to find item ids.`,
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text search over the item's name/identifiers." },
          status: { type: "string", enum: [...INVENTORY_STATUSES] },
          group: { type: "string", description: `Filter by ${adapter.groupLabel}.` },
          min_price: { type: "integer", description: "Minimum price in whole KES." },
          max_price: { type: "integer", description: "Maximum price in whole KES." },
        },
        additionalProperties: false,
      },
    },
    {
      name: "get_item",
      description: `Get the full details of one ${noun} by id.`,
      input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    },
    {
      name: "count_by_status",
      description: `Count ${nouns} by status (available, reserved, sold).`,
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "list_categories",
      description: `List the distinct ${adapter.groupLabel} values currently in stock.`,
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "create_item",
      description: `Propose adding a new ${noun}. The person must confirm before anything is created. Only call it once you have every required field; ask for any that are missing instead of guessing values.`,
      input_schema: {
        type: "object",
        properties: { fields: { type: "object", properties: fieldProperties(adapter.fields), additionalProperties: false } },
        required: ["fields"],
        additionalProperties: false,
      },
    },
    {
      name: "update_item_fields",
      description: `Propose changing fields on one existing ${noun}. Include only the fields that change. The person must confirm.`,
      input_schema: {
        type: "object",
        properties: { id: { type: "string" }, fields: { type: "object", properties: fieldProperties(adapter.fields), additionalProperties: false } },
        required: ["id", "fields"],
        additionalProperties: false,
      },
    },
    {
      name: "set_item_status",
      description: `Propose marking one ${noun} available, reserved or sold. The person must confirm.`,
      input_schema: {
        type: "object",
        properties: { id: { type: "string" }, status: { type: "string", enum: [...INVENTORY_STATUSES] } },
        required: ["id", "status"],
        additionalProperties: false,
      },
    },
    {
      name: "delete_items",
      description: `Propose permanently deleting one or more ${nouns} (at most ${BULK_ACTION_CAP}). Only the business owner may delete. The person must confirm after seeing the exact list.`,
      input_schema: {
        type: "object",
        properties: { ids: { type: "array", items: { type: "string" }, maxItems: BULK_ACTION_CAP } },
        required: ["ids"],
        additionalProperties: false,
      },
    },
    {
      name: "bulk_update",
      description: `Propose the same change to several ${nouns} at once (at most ${BULK_ACTION_CAP}). Provide any of: a new status, a percentage price change (computed exactly by the system, never by you), or other shared fields. The person must confirm after seeing every item.`,
      input_schema: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" }, maxItems: BULK_ACTION_CAP },
          status: { type: "string", enum: [...INVENTORY_STATUSES] },
          percent_price_change: {
            type: "integer",
            description: `Whole-number percentage to raise (positive) or lower (negative) every price by, between -${MAX_PRICE_PERCENT_CHANGE} and ${MAX_PRICE_PERCENT_CHANGE}.`,
          },
          fields: { type: "object", properties: fieldProperties(bulkFields), additionalProperties: false },
        },
        required: ["ids"],
        additionalProperties: false,
      },
    },
  ];
}

import { hasPermission } from "@/features/auth/domain/permissions";
import {
  INVENTORY_STATUSES,
  type FieldSpec,
  type InventoryAdapter,
  type InventoryItem,
  type InventoryStatus,
} from "../domain/inventory-types";
import { BULK_ACTION_CAP, MAX_PRICE_PERCENT_CHANGE, SEARCH_RESULT_LIMIT } from "../domain/thresholds";
import type { Actor, AuditOutcome, ChangeLine, ReadToolName, WriteToolName } from "../domain/types";
import { serializeToolData, stripControlChars, truncateUntrusted } from "../domain/untrusted";

type Json = Record<string, unknown>;

export type Proposal =
  | { ok: true; toolName: WriteToolName; args: Json; summary: string; changes: ChangeLine[] }
  | { ok: false; message: string };

export type ExecutionReport = {
  ok: boolean;
  outcome: AuditOutcome;
  message: string;
  /** The affected items as they were just before the change — recorded in the audit log. */
  before: unknown[];
};

/** One concrete change to one item, fixed at proposal time so what runs is exactly what the card showed. */
type Operation = { id: string; fields?: Record<string, string | number | null>; status?: InventoryStatus };

export function formatMoney(amount: number): string {
  return `KES ${amount.toLocaleString("en-US")}`;
}

function formatValue(spec: FieldSpec | undefined, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (spec?.money && typeof value === "number") return formatMoney(value);
  return stripControlChars(String(value));
}

function itemForModel(item: InventoryItem) {
  const fields: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(item.fields)) {
    fields[key] = typeof value === "string" ? truncateUntrusted(value) : value;
  }
  return { id: item.id, label: truncateUntrusted(item.label), status: item.status, price: item.price, fields };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function asInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function isStatus(value: unknown): value is InventoryStatus {
  return typeof value === "string" && (INVENTORY_STATUSES as readonly string[]).includes(value);
}

function asIdList(value: unknown): { ok: true; ids: string[] } | { ok: false; message: string } {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, message: "Provide at least one item id." };
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim() === "" || entry.length > 100) return { ok: false, message: "Item ids must be non-empty text." };
    if (!ids.includes(entry.trim())) ids.push(entry.trim());
  }
  if (ids.length > BULK_ACTION_CAP) {
    return { ok: false, message: `That is ${ids.length} items; one proposal can cover at most ${BULK_ACTION_CAP}. Split it into smaller batches.` };
  }
  return { ok: true, ids };
}

function operationsFromArgs(args: Json): Operation[] {
  return Array.isArray(args.ops) ? (args.ops as Operation[]) : [];
}

/**
 * Everything Everest can do to inventory, in three phases:
 *  - `runRead`: read tools, executed immediately (data goes back to the model, escaped).
 *  - `propose`: write tools, which only *validate and describe* a change.
 *  - `execute`: runs a previously proposed, human-confirmed change.
 * It works through an `InventoryAdapter` over the existing business-scoped
 * services, so tenant isolation and validation are the app's own.
 */
export class ToolRunner {
  constructor(
    private readonly adapter: InventoryAdapter,
    private readonly actor: Actor,
    /** Resolves the plan-level item limit for creating (null = unlimited). */
    private readonly resolveCreateLimit: () => Promise<{ ok: true; limit: number | null } | { ok: false; message: string }>
  ) {}

  private spec(name: string): FieldSpec | undefined {
    return this.adapter.fields.find((field) => field.name === name);
  }

  // ---------------------------------------------------------------- reads

  /** Returns the tool result already serialized (JSON, angle brackets escaped) for the model. */
  async runRead(name: ReadToolName, input: Json): Promise<{ content: string; isError: boolean }> {
    try {
      switch (name) {
        case "search_inventory": {
          const status = input.status === undefined ? undefined : isStatus(input.status) ? input.status : null;
          if (status === null) return { content: serializeToolData({ error: "status must be available, reserved or sold." }), isError: true };
          const { items, total } = await this.adapter.search({
            query: asString(input.query)?.slice(0, 100),
            status,
            group: asString(input.group)?.slice(0, 100),
            minPrice: asInt(input.min_price),
            maxPrice: asInt(input.max_price),
            limit: SEARCH_RESULT_LIMIT,
          });
          return { content: serializeToolData({ total, shown: items.length, items: items.map(itemForModel) }), isError: false };
        }
        case "get_item": {
          const id = asString(input.id);
          if (!id) return { content: serializeToolData({ error: "id is required." }), isError: true };
          const [item] = await this.adapter.getMany([id]);
          if (!item) return { content: serializeToolData({ error: "No item with that id in this business." }), isError: true };
          return { content: serializeToolData({ item: itemForModel(item) }), isError: false };
        }
        case "count_by_status":
          return { content: serializeToolData({ counts: await this.adapter.countByStatus() }), isError: false };
        case "list_categories":
          return { content: serializeToolData({ [this.adapter.groupLabel + "s"]: (await this.adapter.listGroups()).map((g) => truncateUntrusted(g, 80)) }), isError: false };
      }
    } catch {
      return { content: serializeToolData({ error: "That lookup failed. Try again." }), isError: true };
    }
  }

  // ------------------------------------------------------------- proposals

  async propose(name: WriteToolName, input: Json): Promise<Proposal> {
    try {
      switch (name) {
        case "create_item":
          return this.proposeCreate(input);
        case "update_item_fields":
          return await this.proposeUpdate(input);
        case "set_item_status":
          return await this.proposeStatus(input);
        case "delete_items":
          return await this.proposeDelete(input);
        case "bulk_update":
          return await this.proposeBulk(input);
      }
    } catch {
      return { ok: false, message: "That could not be prepared. Try again." };
    }
  }

  private formatErrors(errors: Record<string, string>): string {
    return Object.values(errors).join(" ");
  }

  private proposeCreate(input: Json): Proposal {
    const raw = input.fields && typeof input.fields === "object" && !Array.isArray(input.fields) ? (input.fields as Json) : null;
    if (!raw) return { ok: false, message: "fields is required." };
    const validated = this.adapter.validateCreate(raw);
    if (!validated.ok) return { ok: false, message: this.formatErrors(validated.errors) };
    const changes: ChangeLine[] = this.adapter.fields
      .filter((spec) => validated.fields[spec.name] !== undefined && validated.fields[spec.name] !== null && validated.fields[spec.name] !== "")
      .map((spec) => ({ label: spec.label, before: null, after: formatValue(spec, validated.fields[spec.name]) }));
    const label = stripControlChars(this.adapter.labelFor(validated.fields));
    return { ok: true, toolName: "create_item", args: { fields: validated.fields }, summary: `Add a new ${this.adapter.itemNoun}: ${label}`, changes };
  }

  private async loadItems(ids: string[]): Promise<{ ok: true; items: InventoryItem[] } | { ok: false; message: string }> {
    const found = await this.adapter.getMany(ids);
    const byId = new Map(found.map((item) => [item.id, item]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      const shown = missing.slice(0, 3).map((id) => `"${stripControlChars(id).slice(0, 40)}"`).join(", ");
      return { ok: false, message: `${missing.length} id(s) were not found in this business (${shown}). Look the items up first.` };
    }
    return { ok: true, items: ids.map((id) => byId.get(id) as InventoryItem) };
  }

  private diffLines(item: InventoryItem, fields: Record<string, string | number | null>, prefix: boolean): ChangeLine[] {
    const lines: ChangeLine[] = [];
    for (const spec of this.adapter.fields) {
      if (!(spec.name in fields)) continue;
      const before = formatValue(spec, item.fields[spec.name]);
      const after = formatValue(spec, fields[spec.name]);
      if (before === after) continue;
      lines.push({ label: prefix ? `${stripControlChars(item.label)} — ${spec.label}` : spec.label, before, after });
    }
    return lines;
  }

  /** Only the fields whose value would actually differ from what the item has now. */
  private changedFields(item: InventoryItem, fields: Record<string, string | number | null>): Record<string, string | number | null> {
    return Object.fromEntries(Object.entries(fields).filter(([key, value]) => this.diffLines(item, { [key]: value }, false).length > 0));
  }

  private async proposeUpdate(input: Json): Promise<Proposal> {
    const id = asString(input.id);
    const raw = input.fields && typeof input.fields === "object" && !Array.isArray(input.fields) ? (input.fields as Json) : null;
    if (!id || !raw) return { ok: false, message: "id and fields are required." };
    const validated = this.adapter.validateUpdate(raw);
    if (!validated.ok) return { ok: false, message: this.formatErrors(validated.errors) };
    const loaded = await this.loadItems([id]);
    if (!loaded.ok) return loaded;
    const item = loaded.items[0];
    const changes = this.diffLines(item, validated.fields, false);
    if (changes.length === 0) return { ok: false, message: "Those values are already what the item has, so nothing would change." };
    const fields = this.changedFields(item, validated.fields);
    return {
      ok: true,
      toolName: "update_item_fields",
      args: { ops: [{ id, fields }] satisfies Operation[] },
      summary: `Update ${stripControlChars(item.label)}`,
      changes,
    };
  }

  private async proposeStatus(input: Json): Promise<Proposal> {
    const id = asString(input.id);
    if (!id || !isStatus(input.status)) return { ok: false, message: "id and a valid status (available, reserved, sold) are required." };
    const loaded = await this.loadItems([id]);
    if (!loaded.ok) return loaded;
    const item = loaded.items[0];
    if (item.status === input.status) return { ok: false, message: `It is already ${input.status}.` };
    if (!this.adapter.canTransition(item.status, input.status)) {
      return { ok: false, message: `A ${item.status} item cannot be changed to ${input.status} directly.` };
    }
    return {
      ok: true,
      toolName: "set_item_status",
      args: { ops: [{ id, status: input.status }] satisfies Operation[] },
      summary: `Mark ${stripControlChars(item.label)} as ${input.status}`,
      changes: [{ label: "Status", before: item.status, after: input.status }],
    };
  }

  private async proposeDelete(input: Json): Promise<Proposal> {
    if (!hasPermission(this.actor.role, this.adapter.deletePermission)) {
      return { ok: false, message: `Only the business owner can delete ${this.adapter.itemNounPlural}. You can mark them as sold instead.` };
    }
    const parsed = asIdList(input.ids);
    if (!parsed.ok) return parsed;
    const loaded = await this.loadItems(parsed.ids);
    if (!loaded.ok) return loaded;
    return {
      ok: true,
      toolName: "delete_items",
      args: { ids: parsed.ids },
      summary: `Permanently delete ${loaded.items.length} ${loaded.items.length === 1 ? this.adapter.itemNoun : this.adapter.itemNounPlural}`,
      changes: loaded.items.map((item) => ({ label: stripControlChars(item.label), before: `${item.status}, ${formatMoney(item.price)}`, after: "Deleted" })),
    };
  }

  private async proposeBulk(input: Json): Promise<Proposal> {
    const parsed = asIdList(input.ids);
    if (!parsed.ok) return parsed;

    const status = input.status === undefined ? undefined : isStatus(input.status) ? input.status : null;
    if (status === null) return { ok: false, message: "status must be available, reserved or sold." };
    const percent = input.percent_price_change === undefined ? undefined : asInt(input.percent_price_change);
    if (input.percent_price_change !== undefined && percent === undefined) return { ok: false, message: "percent_price_change must be a whole number." };
    if (percent !== undefined && (percent === 0 || Math.abs(percent) > MAX_PRICE_PERCENT_CHANGE)) {
      return { ok: false, message: `percent_price_change must be a non-zero whole number between -${MAX_PRICE_PERCENT_CHANGE} and ${MAX_PRICE_PERCENT_CHANGE}.` };
    }
    const rawFields = input.fields && typeof input.fields === "object" && !Array.isArray(input.fields) ? (input.fields as Json) : undefined;

    let sharedFields: Record<string, string | number | null> | undefined;
    if (rawFields && Object.keys(rawFields).length > 0) {
      const notBulk = Object.keys(rawFields).filter((key) => !this.spec(key)?.bulkEditable);
      if (notBulk.length > 0) return { ok: false, message: `These fields cannot be changed in bulk: ${notBulk.join(", ")}.` };
      if (percent !== undefined && "price" in rawFields) return { ok: false, message: "Use either a percentage price change or a fixed price, not both." };
      const validated = this.adapter.validateUpdate(rawFields);
      if (!validated.ok) return { ok: false, message: this.formatErrors(validated.errors) };
      sharedFields = validated.fields;
    }
    if (status === undefined && percent === undefined && !sharedFields) return { ok: false, message: "Say what to change: a status, a price change, or fields." };

    const loaded = await this.loadItems(parsed.ids);
    if (!loaded.ok) return loaded;

    const ops: Operation[] = [];
    const changes: ChangeLine[] = [];
    const blocked: string[] = [];
    for (const item of loaded.items) {
      const op: Operation = { id: item.id };
      let fields: Record<string, string | number | null> = { ...(sharedFields ?? {}) };
      if (percent !== undefined) {
        const newPrice = Math.round((item.price * (100 + percent)) / 100);
        if (newPrice < 1) {
          blocked.push(stripControlChars(item.label));
          continue;
        }
        fields = { ...fields, price: newPrice };
      }
      const lines = this.diffLines(item, fields, true);
      if (lines.length > 0) {
        op.fields = this.changedFields(item, fields);
        changes.push(...lines);
      }
      if (status !== undefined && item.status !== status) {
        if (!this.adapter.canTransition(item.status, status)) {
          blocked.push(stripControlChars(item.label));
          continue;
        }
        op.status = status;
        changes.push({ label: `${stripControlChars(item.label)} — Status`, before: item.status, after: status });
      }
      if (op.fields || op.status) ops.push(op);
    }
    if (blocked.length > 0) {
      const names = blocked.slice(0, 4).join(", ");
      return { ok: false, message: `${blocked.length} item(s) cannot take that change (${names}${blocked.length > 4 ? ", …" : ""}). Remove them from the request and try again.` };
    }
    if (ops.length === 0) return { ok: false, message: "None of those items would change." };

    const parts: string[] = [];
    if (percent !== undefined) parts.push(`${percent > 0 ? "raise" : "lower"} prices by ${Math.abs(percent)}%`);
    if (status !== undefined) parts.push(`mark as ${status}`);
    if (sharedFields) parts.push(`set ${Object.keys(sharedFields).join(", ")}`);
    return {
      ok: true,
      toolName: "bulk_update",
      args: { ops },
      summary: `For ${ops.length} ${ops.length === 1 ? this.adapter.itemNoun : this.adapter.itemNounPlural}: ${parts.join(", ")}`,
      changes,
    };
  }

  // -------------------------------------------------------------- execution

  /** Permission needed to run this action, re-checked at confirm time (not just when proposed). */
  requiresDeletePermission(toolName: WriteToolName): boolean {
    return toolName === "delete_items";
  }

  canRun(toolName: WriteToolName): boolean {
    return !this.requiresDeletePermission(toolName) || hasPermission(this.actor.role, this.adapter.deletePermission);
  }

  async execute(toolName: WriteToolName, args: Json): Promise<ExecutionReport> {
    switch (toolName) {
      case "create_item":
        return this.executeCreate(args);
      case "delete_items":
        return this.executeDelete(args);
      default:
        return this.executeOperations(operationsFromArgs(args));
    }
  }

  private async executeCreate(args: Json): Promise<ExecutionReport> {
    const fields = args.fields as Record<string, string | number | null>;
    const gate = await this.resolveCreateLimit();
    if (!gate.ok) return { ok: false, outcome: "failed", message: gate.message, before: [] };
    const result = await this.adapter.create(fields, gate.limit);
    if (!result.ok) return { ok: false, outcome: "failed", message: stripControlChars(result.error.message), before: [] };
    return { ok: true, outcome: "succeeded", message: `Added ${stripControlChars(result.data.label)}.`, before: [] };
  }

  private async executeDelete(args: Json): Promise<ExecutionReport> {
    const ids = Array.isArray(args.ids) ? (args.ids as string[]) : [];
    const before = await this.adapter.getMany(ids);
    const labels = new Map(before.map((item) => [item.id, stripControlChars(item.label)]));
    let done = 0;
    const failures: string[] = [];
    for (const id of ids) {
      const result = await this.adapter.delete(id);
      if (result.ok) done += 1;
      else failures.push(`${labels.get(id) ?? "an item"} (${stripControlChars(result.error.message)})`);
    }
    return this.report(done, ids.length, failures, "Deleted", before);
  }

  private async executeOperations(ops: Operation[]): Promise<ExecutionReport> {
    const before = await this.adapter.getMany(ops.map((op) => op.id));
    const labels = new Map(before.map((item) => [item.id, stripControlChars(item.label)]));
    let done = 0;
    const failures: string[] = [];
    for (const op of ops) {
      const name = labels.get(op.id) ?? "an item";
      if (op.fields) {
        const result = await this.adapter.update(op.id, op.fields);
        if (!result.ok) {
          failures.push(`${name} (${stripControlChars(result.error.message)})`);
          continue;
        }
      }
      if (op.status) {
        const result = await this.adapter.setStatus(op.id, op.status);
        if (!result.ok) {
          failures.push(`${name} (${stripControlChars(result.error.message)})`);
          continue;
        }
      }
      done += 1;
    }
    return this.report(done, ops.length, failures, "Updated", before);
  }

  private report(done: number, total: number, failures: string[], verb: string, before: unknown[]): ExecutionReport {
    const noun = total === 1 ? this.adapter.itemNoun : this.adapter.itemNounPlural;
    if (failures.length === 0) return { ok: true, outcome: "succeeded", message: `${verb} ${done} ${noun}.`, before };
    const detail = failures.slice(0, 3).join("; ") + (failures.length > 3 ? "; …" : "");
    if (done === 0) return { ok: false, outcome: "failed", message: `Nothing was changed. ${detail}`, before };
    return { ok: false, outcome: "partial", message: `${verb} ${done} of ${total} ${noun}. Not changed: ${detail}`, before };
  }
}

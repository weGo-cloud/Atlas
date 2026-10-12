import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import type { LlmClient, LlmRequest, LlmResponse, LlmToolResultBlock } from "../llm/llm-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../lib/db/migrations");

/** Creates a throw-away SQLite file with every migration applied and points DATABASE_URL at it. Call BEFORE importing anything that touches `@/lib/db/client`. */
export function createTestDatabase(prefix: string) {
  const dir = mkdtempSync(path.join(tmpdir(), `atlas-${prefix}-`));
  const dbPath = path.join(dir, "test.db");
  process.env.DATABASE_URL = `file:${dbPath}`;
  const raw = new Database(dbPath);
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(path.join(migrationsDir, file), "utf-8").replaceAll("--> statement-breakpoint", ""));
  }
  return {
    raw,
    cleanup() {
      raw.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type SeedProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  status?: string;
  condition?: string;
  material?: string | null;
  color?: string | null;
  dimensions?: string | null;
  description?: string;
};

export function seedBusiness(raw: Database.Database, businessId: string, name = "Test Furniture") {
  const now = new Date().toISOString();
  raw.prepare("INSERT INTO businesses (id, name, vertical, website_mode, created_at, updated_at) VALUES (?, ?, 'furniture', 'atlas_hosted', ?, ?)").run(businessId, name, now, now);
}

export function seedProducts(raw: Database.Database, businessId: string, products: SeedProduct[]) {
  const now = new Date().toISOString();
  const insert = raw.prepare(
    "INSERT INTO furniture_products (id, business_id, name, description, category, price, currency, condition, status, material, color, dimensions, sku, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'KES', ?, ?, ?, ?, ?, NULL, ?, ?)"
  );
  for (const p of products) {
    insert.run(p.id, businessId, p.name, p.description ?? `${p.name} description`, p.category, p.price, p.condition ?? "new", p.status ?? "available", p.material ?? null, p.color ?? null, p.dimensions ?? null, now, now);
  }
}

export const SAMPLE_PRODUCTS: SeedProduct[] = [
  { id: "p_sofa_grey_small", name: "Kilimani Compact 2-Seater", category: "sofas", price: 42000, color: "Light grey", material: "Polyester fabric", dimensions: "150cm x 80cm x 82cm", description: "Slim 2-seater for small apartments." },
  { id: "p_sofa_grey_big", name: "Nairobi 3-Seater Sofa", category: "sofas", price: 68000, color: "Charcoal grey", material: "Woven fabric", dimensions: "210cm x 90cm x 85cm" },
  { id: "p_sofa_leather", name: "Muthaiga Leather 3-Seater", category: "sofas", price: 145000, color: "Tan brown", material: "Genuine leather", dimensions: "220cm x 95cm x 88cm" },
  { id: "p_sofa_reserved", name: "Runda Velvet 3-Seater", category: "sofas", price: 89000, color: "Emerald green", material: "Velvet", status: "reserved", dimensions: "205cm x 90cm x 84cm" },
  { id: "p_sofa_sold", name: "Roysambu Loveseat", category: "sofas", price: 24000, color: "Beige", status: "sold" },
  { id: "p_bed_queen", name: "Karen Queen Bed Frame", category: "beds", price: 45000, color: "Walnut brown", material: "Solid mahogany", dimensions: "160cm x 200cm" },
  { id: "p_desk", name: "Upperhill Office Desk", category: "office_furniture", price: 22000, condition: "used", color: "White", material: "Engineered wood", dimensions: "120cm x 60cm x 75cm" },
];

export type ScriptedStep = (request: LlmRequest) => LlmResponse;

/** A model stand-in for tests: replays scripted steps and records every request. Never used in production code. */
export class ScriptedLlm implements LlmClient {
  readonly calls: LlmRequest[] = [];
  constructor(private readonly steps: ScriptedStep[]) {}
  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(JSON.parse(JSON.stringify(request)) as LlmRequest);
    const step = this.steps.shift();
    if (!step) throw new Error("ScriptedLlm: no scripted step left for this call");
    return step(request);
  }
}

let toolCounter = 0;
export const say = (text: string): ScriptedStep => () => ({ content: [{ type: "text", text }], stopReason: "end_turn" });
export const callTools = (...calls: Array<[string, Record<string, unknown>]>): ScriptedStep => () => ({
  content: calls.map(([name, input]) => {
    toolCounter += 1;
    return { type: "tool_use" as const, id: `toolu_${toolCounter}`, name, input };
  }),
  stopReason: "tool_use",
});

/** The parsed JSON of every tool_result in the most recent user message of a request. */
export function lastToolResults(request: LlmRequest): unknown[] {
  const last = request.messages[request.messages.length - 1];
  if (!last || typeof last.content === "string") return [];
  return (last.content as LlmToolResultBlock[]).filter((b) => b.type === "tool_result").map((b) => JSON.parse(b.content));
}

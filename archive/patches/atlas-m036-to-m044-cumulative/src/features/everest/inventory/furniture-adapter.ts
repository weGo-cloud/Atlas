import {
  canTransitionFurnitureStatus,
  FURNITURE_CATEGORIES,
  FURNITURE_CONDITIONS,
  type FurnitureCategory,
  type FurnitureProduct,
  type FurnitureStatus,
} from "@/features/furniture/domain/furniture-product";
import type { CreateFurnitureProductInput, UpdateFurnitureProductInput } from "@/features/furniture/domain/furniture-product-input";
import {
  validateCreateFurnitureProductInput,
  validateUpdateFurnitureProductInput,
} from "@/features/furniture/domain/validate-furniture-product-input";
import type { FurnitureProductService } from "@/features/furniture/service/furniture-product-service";
import type { FieldSpec, InventoryAdapter, InventoryItem, InventoryResult, InventoryStatus } from "../domain/inventory-types";
import { coerceFields } from "./coerce";

const FIELDS: readonly FieldSpec[] = [
  { name: "name", type: "string", label: "Name", description: "Product name.", requiredOnCreate: true, bulkEditable: false },
  { name: "description", type: "string", label: "Description", description: "Listing text.", requiredOnCreate: false, bulkEditable: false },
  { name: "category", type: "string", label: "Category", description: "Product category.", enum: FURNITURE_CATEGORIES, requiredOnCreate: true, bulkEditable: true },
  { name: "price", type: "integer", label: "Price", description: "Price in whole KES.", requiredOnCreate: true, bulkEditable: true, money: true },
  { name: "condition", type: "string", label: "Condition", description: "Product condition.", enum: FURNITURE_CONDITIONS, requiredOnCreate: true, bulkEditable: true },
  { name: "material", type: "string", label: "Material", description: "Main material(s).", requiredOnCreate: false, bulkEditable: true },
  { name: "color", type: "string", label: "Color", description: "Main colour.", requiredOnCreate: false, bulkEditable: true },
  { name: "dimensions", type: "string", label: "Dimensions", description: 'Free text, e.g. "180cm x 90cm x 75cm".', requiredOnCreate: false, bulkEditable: false },
  { name: "sku", type: "string", label: "SKU", description: "Stock keeping code.", requiredOnCreate: false, bulkEditable: false },
];

function toItem(product: FurnitureProduct): InventoryItem {
  return {
    id: product.id,
    label: product.name,
    status: product.status,
    price: product.price,
    fields: {
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      condition: product.condition,
      material: product.material,
      color: product.color,
      dimensions: product.dimensions,
      sku: product.sku,
    },
  };
}

function mapResult<T, U>(
  result: { ok: true; data: T } | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string | undefined> } },
  map: (data: T) => U
): InventoryResult<U> {
  if (result.ok) return { ok: true, data: map(result.data) };
  const fieldErrors: Record<string, string> = {};
  for (const [key, value] of Object.entries(result.error.fieldErrors ?? {})) {
    if (value) fieldErrors[key] = value;
  }
  return {
    ok: false,
    error: { code: result.error.code, message: result.error.message, ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}) },
  };
}

function nullable(value: string | number | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toCreateInput(fields: Record<string, string | number | null>): CreateFurnitureProductInput {
  return {
    name: String(fields.name),
    description: typeof fields.description === "string" ? fields.description : "",
    category: fields.category as FurnitureCategory,
    price: Number(fields.price),
    currency: "KES",
    condition: fields.condition as CreateFurnitureProductInput["condition"],
    status: "available",
    material: nullable(fields.material),
    color: nullable(fields.color),
    dimensions: nullable(fields.dimensions),
    sku: nullable(fields.sku),
  };
}

/** Adapts the existing, business-scoped FurnitureProductService to the assistant's tool vocabulary. */
export class FurnitureInventoryAdapter implements InventoryAdapter {
  readonly vertical = "furniture" as const;
  readonly itemNoun = "furniture product";
  readonly itemNounPlural = "furniture products";
  readonly groupLabel = "category";
  readonly limitKey = "furniture_products" as const;
  readonly deletePermission = "furniture_product.delete" as const;
  readonly fields = FIELDS;

  constructor(private readonly service: FurnitureProductService) {}

  async search(filters: { query?: string; status?: InventoryStatus; group?: string; minPrice?: number; maxPrice?: number; limit: number }) {
    const category = filters.group && (FURNITURE_CATEGORIES as readonly string[]).includes(filters.group) ? (filters.group as FurnitureCategory) : undefined;
    const result = await this.service.listProductsPaged({
      search: filters.query,
      status: filters.status as FurnitureStatus | undefined,
      category,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      page: 1,
      pageSize: filters.limit,
    });
    return { items: result.items.map(toItem), total: result.total };
  }

  async getMany(ids: string[]): Promise<InventoryItem[]> {
    return (await this.service.getProductsByIds(ids)).map(toItem);
  }

  async countByStatus() {
    return this.service.countByStatus();
  }

  async listGroups(): Promise<string[]> {
    return this.service.listDistinctCategories();
  }

  canTransition(from: InventoryStatus, to: InventoryStatus): boolean {
    return canTransitionFurnitureStatus(from, to);
  }

  labelFor(fields: Record<string, string | number | null>): string {
    return String(fields.name ?? "New product");
  }

  validateCreate(fields: Record<string, unknown>) {
    const coerced = coerceFields(FIELDS, fields, { partial: false });
    if (!coerced.ok) return coerced;
    const errors = validateCreateFurnitureProductInput(toCreateInput(coerced.fields));
    if (Object.keys(errors).length > 0) return { ok: false as const, errors: errors as Record<string, string> };
    return coerced;
  }

  validateUpdate(fields: Record<string, unknown>) {
    const coerced = coerceFields(FIELDS, fields, { partial: true });
    if (!coerced.ok) return coerced;
    if (Object.keys(coerced.fields).length === 0) return { ok: false as const, errors: { fields: "No fields to change were given." } };
    const errors = validateUpdateFurnitureProductInput(coerced.fields as UpdateFurnitureProductInput);
    if (Object.keys(errors).length > 0) return { ok: false as const, errors: errors as Record<string, string> };
    return coerced;
  }

  async create(fields: Record<string, string | number | null>, limit: number | null) {
    return mapResult(await this.service.createProductWithinLimit(toCreateInput(fields), limit), toItem);
  }

  async update(id: string, fields: Record<string, string | number | null>) {
    return mapResult(await this.service.updateProduct(id, fields as UpdateFurnitureProductInput), toItem);
  }

  async setStatus(id: string, status: InventoryStatus) {
    return mapResult(await this.service.updateProductStatus(id, status), toItem);
  }

  async delete(id: string) {
    return mapResult(await this.service.deleteProduct(id), (outcome) => outcome);
  }
}

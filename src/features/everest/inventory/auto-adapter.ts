import type { Vehicle, VehicleStatus } from "@/features/inventory/data/types";
import type { CreateVehicleInput, UpdateVehicleInput } from "@/features/inventory/domain/vehicle-input";
import { canTransitionStatus } from "@/features/inventory/domain/vehicle-status";
import { validateCreateVehicleInput, validateUpdateVehicleInput } from "@/features/inventory/domain/validate-vehicle-input";
import type { VehicleService } from "@/features/inventory/service/vehicle-service";
import type { FieldSpec, InventoryAdapter, InventoryItem, InventoryResult, InventoryStatus } from "../domain/inventory-types";
import { coerceFields } from "./coerce";

const FIELDS: readonly FieldSpec[] = [
  { name: "make", type: "string", label: "Make", description: "Manufacturer, e.g. Toyota.", requiredOnCreate: true, bulkEditable: false },
  { name: "model", type: "string", label: "Model", description: "Model name, e.g. Prado.", requiredOnCreate: true, bulkEditable: false },
  { name: "year", type: "integer", label: "Year", description: "Model year, e.g. 2018.", requiredOnCreate: true, bulkEditable: false },
  { name: "stockId", type: "string", label: "Stock ID", description: "Unique stock identifier within this business.", requiredOnCreate: true, bulkEditable: false },
  { name: "mileage", type: "integer", label: "Mileage (km)", description: "Odometer reading in kilometres.", requiredOnCreate: true, bulkEditable: false },
  { name: "price", type: "integer", label: "Price", description: "Asking price in whole KES.", requiredOnCreate: true, bulkEditable: true, money: true },
  { name: "description", type: "string", label: "Description", description: "Listing text.", requiredOnCreate: false, bulkEditable: false },
];

function toItem(vehicle: Vehicle): InventoryItem {
  return {
    id: vehicle.id,
    label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    status: vehicle.status,
    price: vehicle.price,
    fields: {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      stockId: vehicle.stockId,
      mileage: vehicle.mileage,
      price: vehicle.price,
      description: vehicle.description,
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

/** Adapts the existing, business-scoped VehicleService to the assistant's tool vocabulary. */
export class AutoInventoryAdapter implements InventoryAdapter {
  readonly vertical = "auto" as const;
  readonly itemNoun = "vehicle";
  readonly itemNounPlural = "vehicles";
  readonly groupLabel = "make";
  readonly limitKey = "vehicles" as const;
  readonly deletePermission = "vehicle.delete" as const;
  readonly fields = FIELDS;

  constructor(private readonly service: VehicleService) {}

  async search(filters: { query?: string; status?: InventoryStatus; group?: string; minPrice?: number; maxPrice?: number; limit: number }) {
    const result = await this.service.listVehiclesPaged({
      search: filters.query,
      status: filters.status as VehicleStatus | undefined,
      make: filters.group,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      page: 1,
      pageSize: filters.limit,
    });
    return { items: result.items.map(toItem), total: result.total };
  }

  async getMany(ids: string[]): Promise<InventoryItem[]> {
    return (await this.service.getVehiclesByIds(ids)).map(toItem);
  }

  async countByStatus() {
    return this.service.countByStatus();
  }

  async listGroups(): Promise<string[]> {
    return this.service.listDistinctMakes();
  }

  canTransition(from: InventoryStatus, to: InventoryStatus): boolean {
    return canTransitionStatus(from, to);
  }

  labelFor(fields: Record<string, string | number | null>): string {
    return [fields.year, fields.make, fields.model].filter((part) => part !== null && part !== undefined && part !== "").join(" ");
  }

  validateCreate(fields: Record<string, unknown>) {
    const coerced = coerceFields(FIELDS, fields, { partial: false });
    if (!coerced.ok) return coerced;
    const input: CreateVehicleInput = {
      make: String(coerced.fields.make),
      model: String(coerced.fields.model),
      year: Number(coerced.fields.year),
      stockId: String(coerced.fields.stockId),
      mileage: Number(coerced.fields.mileage),
      price: Number(coerced.fields.price),
      status: "available",
      description: typeof coerced.fields.description === "string" ? coerced.fields.description : "",
    };
    const errors = validateCreateVehicleInput(input);
    if (Object.keys(errors).length > 0) return { ok: false as const, errors: errors as Record<string, string> };
    return { ok: true as const, fields: { ...coerced.fields, description: input.description } };
  }

  validateUpdate(fields: Record<string, unknown>) {
    const coerced = coerceFields(FIELDS, fields, { partial: true });
    if (!coerced.ok) return coerced;
    if (Object.keys(coerced.fields).length === 0) return { ok: false as const, errors: { fields: "No fields to change were given." } };
    const errors = validateUpdateVehicleInput(coerced.fields as UpdateVehicleInput);
    if (Object.keys(errors).length > 0) return { ok: false as const, errors: errors as Record<string, string> };
    return coerced;
  }

  async create(fields: Record<string, string | number | null>, limit: number | null) {
    const input: CreateVehicleInput = {
      make: String(fields.make),
      model: String(fields.model),
      year: Number(fields.year),
      stockId: String(fields.stockId),
      mileage: Number(fields.mileage),
      price: Number(fields.price),
      status: "available",
      description: typeof fields.description === "string" ? fields.description : "",
    };
    return mapResult(await this.service.createVehicleWithinLimit(input, limit), toItem);
  }

  async update(id: string, fields: Record<string, string | number | null>) {
    return mapResult(await this.service.updateVehicle(id, fields as UpdateVehicleInput), toItem);
  }

  async setStatus(id: string, status: InventoryStatus) {
    return mapResult(await this.service.updateVehicleStatus(id, status), toItem);
  }

  async delete(id: string) {
    return mapResult(await this.service.deleteVehicle(id), (outcome) => outcome);
  }
}

import { MOCK_INVENTORY } from "../data/mock-inventory";
import type { Vehicle, VehicleStatus } from "../data/types";
import type { CreateVehicleInput, UpdateVehicleInput } from "../domain/vehicle-input";
import { normalizePagination, type PaginatedResult, type VehicleQuery, type VehicleSortOption } from "../domain/vehicle-query";
import type { VehicleRepository } from "./vehicle-repository";

/**
 * In-memory implementation of VehicleRepository, seeded from the Mission
 * 002 mock dataset. Lives only for the lifetime of the server process —
 * there is no real database yet. Mission 006 can introduce a
 * DatabaseVehicleRepository implementing the same interface; nothing
 * above the repository boundary (service, actions, UI) needs to change.
 */
export class MockVehicleRepository implements VehicleRepository {
  private vehicles: Vehicle[];
  private readonly businessId: string;
  /**
   * Mission 027 — this mock has no notion of Lead (a different
   * feature's domain), so the vehicle ids with an active lead are
   * injected directly rather than computed from seeded lead data.
   * Defaults to empty, so every existing caller (just
   * vehicle-service.test.ts as of this mission) is unaffected.
   */
  private readonly activeLeadVehicleIds: Set<string>;

  constructor(seed: Vehicle[] = MOCK_INVENTORY, businessId = "biz_mock", activeLeadVehicleIds: string[] = []) {
    // Clone so mutations never touch the original seed array — keeps
    // each repository instance (e.g. one per test) independent.
    this.vehicles = structuredClone(seed);
    this.businessId = businessId;
    this.activeLeadVehicleIds = new Set(activeLeadVehicleIds);
  }

  async list(): Promise<Vehicle[]> {
    return [...this.vehicles];
  }

  async getById(id: string): Promise<Vehicle | null> {
    return this.vehicles.find((vehicle) => vehicle.id === id) ?? null;
  }

  async getByIds(ids: string[]): Promise<Vehicle[]> {
    const idSet = new Set(ids);
    return this.vehicles.filter((vehicle) => idSet.has(vehicle.id));
  }

  async findByStockId(stockId: string): Promise<Vehicle | null> {
    const normalized = stockId.trim().toLowerCase();
    return (
      this.vehicles.find(
        (vehicle) => vehicle.stockId.toLowerCase() === normalized
      ) ?? null
    );
  }

  async create(input: CreateVehicleInput): Promise<Vehicle> {
    const now = new Date().toISOString();
    const vehicle: Vehicle = {
      id: this.generateId(),
      businessId: this.businessId,
      ...input,
      addedAt: now,
      updatedAt: now,
    };

    this.vehicles.push(vehicle);
    return vehicle;
  }

  /** In-process JS is single-threaded and this mock has no real concurrent callers, so a plain sequential check-then-push is a faithful mock of the transactional guarantee DatabaseVehicleRepository provides — see that class's doc comment for why the real implementation needs a synchronous DB transaction and this one doesn't. */
  async createWithinLimit(
    input: CreateVehicleInput,
    limit: number | null
  ): Promise<{ vehicle: Vehicle | null; currentCount: number; limitExceeded: boolean }> {
    const currentCount = this.vehicles.length;
    if (limit !== null && currentCount >= limit) {
      return { vehicle: null, currentCount, limitExceeded: true };
    }
    const vehicle = await this.create(input);
    return { vehicle, currentCount: currentCount + 1, limitExceeded: false };
  }

  async update(
    id: string,
    input: UpdateVehicleInput
  ): Promise<Vehicle | null> {
    const index = this.vehicles.findIndex((vehicle) => vehicle.id === id);
    if (index === -1) return null;

    const updated: Vehicle = {
      ...this.vehicles[index],
      ...input,
      updatedAt: new Date().toISOString(),
    };

    this.vehicles[index] = updated;
    return updated;
  }

  private generateId(): string {
    return `veh_${String(this.vehicles.length + 1).padStart(3, "0")}`;
  }

  async delete(id: string): Promise<boolean> {
    const index = this.vehicles.findIndex((vehicle) => vehicle.id === id);
    if (index === -1) return false;
    this.vehicles.splice(index, 1);
    return true;
  }

  async countByStatus(): Promise<Record<VehicleStatus, number>> {
    const counts: Record<VehicleStatus, number> = {
      available: 0,
      reserved: 0,
      sold: 0,
    };
    for (const vehicle of this.vehicles) {
      counts[vehicle.status] += 1;
    }
    return counts;
  }

  async listDistinctMakes(): Promise<string[]> {
    return Array.from(new Set(this.vehicles.map((v) => v.make))).sort();
  }

  async getActiveInventoryValueStats(): Promise<{
    activeCount: number;
    totalValue: number;
    averagePrice: number;
  }> {
    const active = this.vehicles.filter((v) => v.status !== "sold");
    const totalValue = active.reduce((sum, v) => sum + v.price, 0);
    const averagePrice =
      active.length > 0 ? Math.round(totalValue / active.length) : 0;
    return { activeCount: active.length, totalValue, averagePrice };
  }

  async countAddedSince(sinceIso: string): Promise<number> {
    return this.vehicles.filter((v) => v.addedAt >= sinceIso).length;
  }

  async countByMake(limit: number): Promise<{ make: string; count: number }[]> {
    const counts = new Map<string, number>();
    for (const vehicle of this.vehicles) {
      counts.set(vehicle.make, (counts.get(vehicle.make) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([make, count]) => ({ make, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /** Mission 026 — see VehicleRepository interface doc. */
  async getAvailableVehicleAgeDays(now: string): Promise<number[]> {
    const nowMs = new Date(now).getTime();
    return this.vehicles
      .filter((v) => v.status === "available")
      .map((v) => (nowMs - new Date(v.addedAt).getTime()) / (24 * 60 * 60 * 1000))
      .sort((a, b) => b - a);
  }

  /** Mission 026 — see VehicleRepository interface doc. */
  async getStaleAvailableVehicles(minAgeDays: number, now: string, limit: number): Promise<Vehicle[]> {
    const cutoff = new Date(new Date(now).getTime() - minAgeDays * 24 * 60 * 60 * 1000).toISOString();
    return this.vehicles
      .filter((v) => v.status === "available" && v.addedAt <= cutoff)
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
      .slice(0, limit);
  }

  /** Mission 027 — see VehicleRepository interface doc. */
  async getAvailableVehicleAgeDaysWithoutActiveLead(now: string): Promise<number[]> {
    const nowMs = new Date(now).getTime();
    return this.vehicles
      .filter((v) => v.status === "available" && !this.activeLeadVehicleIds.has(v.id))
      .map((v) => (nowMs - new Date(v.addedAt).getTime()) / (24 * 60 * 60 * 1000))
      .sort((a, b) => b - a);
  }

  /** Mission 027 — see VehicleRepository interface doc. */
  async getStaleAvailableVehiclesWithoutActiveLead(minAgeDays: number, now: string, limit: number): Promise<Vehicle[]> {
    const cutoff = new Date(new Date(now).getTime() - minAgeDays * 24 * 60 * 60 * 1000).toISOString();
    return this.vehicles
      .filter((v) => v.status === "available" && v.addedAt <= cutoff && !this.activeLeadVehicleIds.has(v.id))
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
      .slice(0, limit);
  }

  async listPaged(query: VehicleQuery): Promise<PaginatedResult<Vehicle>> {
    let items = [...this.vehicles];

    if (query.status) {
      items = items.filter((v) => v.status === query.status);
    }
    if (query.make) {
      items = items.filter(
        (v) => v.make.toLowerCase() === query.make!.toLowerCase()
      );
    }
    if (query.model) {
      items = items.filter(
        (v) => v.model.toLowerCase() === query.model!.toLowerCase()
      );
    }
    if (query.minPrice != null) {
      items = items.filter((v) => v.price >= query.minPrice!);
    }
    if (query.maxPrice != null) {
      items = items.filter((v) => v.price <= query.maxPrice!);
    }
    if (query.minYear != null) {
      items = items.filter((v) => v.year >= query.minYear!);
    }
    if (query.maxYear != null) {
      items = items.filter((v) => v.year <= query.maxYear!);
    }
    if (query.search && query.search.trim() !== "") {
      const term = query.search.trim().toLowerCase();
      items = items.filter(
        (v) =>
          v.stockId.toLowerCase().includes(term) ||
          v.make.toLowerCase().includes(term) ||
          v.model.toLowerCase().includes(term)
      );
    }

    items = sortMockVehicles(items, query.sort);

    const { page, pageSize } = normalizePagination(query);
    const total = items.length;
    const start = (page - 1) * pageSize;
    const paged = items.slice(start, start + pageSize);

    return {
      items: paged,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}

function sortMockVehicles(
  vehicles: Vehicle[],
  sort?: VehicleSortOption
): Vehicle[] {
  const sorted = [...vehicles];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "year-desc":
      return sorted.sort((a, b) => b.year - a.year);
    case "newest":
    default:
      return sorted.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }
}

/** Shared singleton used by the app outside of tests. */
export const mockVehicleRepository = new MockVehicleRepository();

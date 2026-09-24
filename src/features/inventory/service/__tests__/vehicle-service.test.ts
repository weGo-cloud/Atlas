import { beforeEach, describe, expect, it } from "vitest";

import { MOCK_INVENTORY } from "../../data/mock-inventory";
import type { CreateVehicleInput } from "../../domain/vehicle-input";
import { MockVehicleRepository } from "../../repository/mock-vehicle-repository";
import { VehicleService } from "../vehicle-service";

function validInput(overrides: Partial<CreateVehicleInput> = {}): CreateVehicleInput {
  return {
    make: "Toyota",
    model: "Vitz",
    year: 2021,
    stockId: "ATL-9001",
    mileage: 12000,
    price: 1800000,
    status: "available",
    description: "A test vehicle.",
    ...overrides,
  };
}

describe("VehicleService", () => {
  let service: VehicleService;

  // Fresh repository per test so mutations in one test never leak into
  // another — each test gets its own clone of the seed data.
  beforeEach(() => {
    service = new VehicleService(new MockVehicleRepository());
  });

  it("retrieves the full list of vehicles", async () => {
    const vehicles = await service.listVehicles();
    expect(vehicles).toHaveLength(MOCK_INVENTORY.length);
    expect(vehicles[0].stockId).toBe(MOCK_INVENTORY[0].stockId);
  });

  it("retrieves a vehicle by id", async () => {
    const result = await service.getVehicle("veh_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.make).toBe("Toyota");
      expect(result.data.model).toBe("Harrier");
    }
  });

  it("returns a NOT_FOUND error for a missing vehicle", async () => {
    const result = await service.getVehicle("does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("creates a vehicle with a generated id and timestamps", async () => {
    const result = await service.createVehicle(validInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBeTruthy();
      expect(result.data.stockId).toBe("ATL-9001");
      expect(result.data.addedAt).toBeTruthy();
      expect(result.data.updatedAt).toBeTruthy();
    }

    // The new vehicle is now retrievable through the same service.
    const vehicles = await service.listVehicles();
    expect(vehicles).toHaveLength(MOCK_INVENTORY.length + 1);
  });

  it("rejects invalid vehicle data with field errors", async () => {
    const result = await service.createVehicle(
      validInput({ make: "", price: -5 })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fieldErrors?.make).toBeTruthy();
      expect(result.error.fieldErrors?.price).toBeTruthy();
    }
  });

  it("rejects a duplicate stock ID on create", async () => {
    const result = await service.createVehicle(
      validInput({ stockId: "ATL-1042" }) // already used by veh_001
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DUPLICATE_STOCK_ID");
      expect(result.error.fieldErrors?.stockId).toBeTruthy();
    }
  });

  it("updates an existing vehicle", async () => {
    const result = await service.updateVehicle("veh_001", {
      price: 7000000,
      status: "reserved",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(7000000);
      expect(result.data.status).toBe("reserved");
      // Untouched fields are preserved.
      expect(result.data.make).toBe("Toyota");
    }
  });

  it("allows updating a vehicle to keep its own stock ID", async () => {
    const result = await service.updateVehicle("veh_001", {
      stockId: "ATL-1042",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects updating to a stock ID already used by another vehicle", async () => {
    const result = await service.updateVehicle("veh_001", {
      stockId: "ATL-1043", // belongs to veh_002
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DUPLICATE_STOCK_ID");
    }
  });

  it("returns a NOT_FOUND error when updating a missing vehicle", async () => {
    const result = await service.updateVehicle("does-not-exist", {
      price: 1000000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  describe("status transitions", () => {
    it("allows available -> reserved", async () => {
      const result = await service.updateVehicleStatus("veh_001", "reserved");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.status).toBe("reserved");
    });

    it("allows reserved -> sold", async () => {
      await service.updateVehicleStatus("veh_001", "reserved");
      const result = await service.updateVehicleStatus("veh_001", "sold");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.status).toBe("sold");
    });

    it("allows sold -> available", async () => {
      await service.updateVehicleStatus("veh_001", "reserved");
      await service.updateVehicleStatus("veh_001", "sold");
      const result = await service.updateVehicleStatus("veh_001", "available");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.status).toBe("available");
    });

    it("rejects sold -> reserved as an invalid transition", async () => {
      await service.updateVehicleStatus("veh_001", "reserved");
      await service.updateVehicleStatus("veh_001", "sold");
      const result = await service.updateVehicleStatus("veh_001", "reserved");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("rejects a no-op transition to the same status", async () => {
      const result = await service.updateVehicleStatus("veh_001", "available");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("returns NOT_FOUND for a missing vehicle", async () => {
      const result = await service.updateVehicleStatus(
        "does-not-exist",
        "reserved"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });
  });

  describe("deleteVehicle", () => {
    it("deletes an existing vehicle", async () => {
      const result = await service.deleteVehicle("veh_001");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.mediaCleanupFailures).toBe(0);

      const vehicles = await service.listVehicles();
      expect(vehicles).toHaveLength(MOCK_INVENTORY.length - 1);
      expect(vehicles.find((v) => v.id === "veh_001")).toBeUndefined();
    });

    it("returns NOT_FOUND for a missing vehicle", async () => {
      const result = await service.deleteVehicle("does-not-exist");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });
  });

  describe("listVehiclesPaged", () => {
    it("filters by status", async () => {
      const result = await service.listVehiclesPaged({ status: "available" });
      expect(result.items.every((v) => v.status === "available")).toBe(true);
    });

    it("filters by make", async () => {
      const result = await service.listVehiclesPaged({ make: "Toyota" });
      expect(result.items.every((v) => v.make === "Toyota")).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
    });

    it("filters by price range", async () => {
      const result = await service.listVehiclesPaged({
        minPrice: 5000000,
        maxPrice: 7000000,
      });
      expect(
        result.items.every((v) => v.price >= 5000000 && v.price <= 7000000)
      ).toBe(true);
    });

    it("filters by year range", async () => {
      const result = await service.listVehiclesPaged({
        minYear: 2022,
        maxYear: 2022,
      });
      expect(result.items.every((v) => v.year === 2022)).toBe(true);
    });

    it("matches search text against stock id, make, or model", async () => {
      const result = await service.listVehiclesPaged({ search: "Harrier" });
      expect(result.items.some((v) => v.model === "Harrier")).toBe(true);
    });

    it("paginates results", async () => {
      const pageOne = await service.listVehiclesPaged({ page: 1, pageSize: 5 });
      const pageTwo = await service.listVehiclesPaged({ page: 2, pageSize: 5 });
      expect(pageOne.items).toHaveLength(5);
      expect(pageOne.total).toBe(MOCK_INVENTORY.length);
      expect(pageOne.items[0].id).not.toBe(pageTwo.items[0]?.id);
    });

    it("clamps an out-of-range page size to the maximum", async () => {
      const result = await service.listVehiclesPaged({ pageSize: 99999 });
      expect(result.pageSize).toBeLessThanOrEqual(100);
    });

    it("sorts by price ascending", async () => {
      const result = await service.listVehiclesPaged({
        sort: "price-asc",
        pageSize: 100,
      });
      const prices = result.items.map((v) => v.price);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    });

    it("combines multiple filters", async () => {
      const result = await service.listVehiclesPaged({
        status: "available",
        make: "Toyota",
        minYear: 2020,
      });
      expect(
        result.items.every(
          (v) =>
            v.status === "available" && v.make === "Toyota" && v.year >= 2020
        )
      ).toBe(true);
    });
  });
});

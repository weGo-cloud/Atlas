import { describe, expect, it } from "vitest";

import type { CreateFurnitureProductInput } from "../furniture-product-input";
import { validateCreateFurnitureProductInput, validateUpdateFurnitureProductInput } from "../validate-furniture-product-input";

function validInput(overrides: Partial<CreateFurnitureProductInput> = {}): CreateFurnitureProductInput {
  return {
    name: "Nairobi 3-Seater Sofa",
    description: "A comfortable sofa.",
    category: "sofas",
    price: 50000,
    currency: "KES",
    condition: "new",
    status: "available",
    material: "Fabric",
    color: "Grey",
    dimensions: "210cm x 90cm x 85cm",
    sku: "SOF-001",
    ...overrides,
  };
}

describe("validateCreateFurnitureProductInput", () => {
  it("returns no errors for fully valid input", () => {
    expect(validateCreateFurnitureProductInput(validInput())).toEqual({});
  });

  it("requires a non-empty name", () => {
    const errors = validateCreateFurnitureProductInput(validInput({ name: "   " }));
    expect(errors.name).toBeDefined();
  });

  it("rejects a name over the max length", () => {
    const errors = validateCreateFurnitureProductInput(validInput({ name: "x".repeat(201) }));
    expect(errors.name).toBeDefined();
  });

  it("rejects a zero or negative price", () => {
    expect(validateCreateFurnitureProductInput(validInput({ price: 0 })).price).toBeDefined();
    expect(validateCreateFurnitureProductInput(validInput({ price: -100 })).price).toBeDefined();
  });

  it("rejects a non-finite price", () => {
    expect(validateCreateFurnitureProductInput(validInput({ price: NaN })).price).toBeDefined();
  });

  it("accepts a valid positive price", () => {
    expect(validateCreateFurnitureProductInput(validInput({ price: 1 })).price).toBeUndefined();
  });

  it("rejects an invalid category", () => {
    // @ts-expect-error deliberately invalid for the test
    const errors = validateCreateFurnitureProductInput(validInput({ category: "spaceships" }));
    expect(errors.category).toBeDefined();
  });

  it("rejects an invalid condition", () => {
    // @ts-expect-error deliberately invalid for the test
    const errors = validateCreateFurnitureProductInput(validInput({ condition: "pristine" }));
    expect(errors.condition).toBeDefined();
  });

  it("rejects an invalid status", () => {
    // @ts-expect-error deliberately invalid for the test
    const errors = validateCreateFurnitureProductInput(validInput({ status: "discontinued" }));
    expect(errors.status).toBeDefined();
  });

  it("requires a non-empty currency", () => {
    const errors = validateCreateFurnitureProductInput(validInput({ currency: "" }));
    expect(errors.currency).toBeDefined();
  });

  it("allows material/color/dimensions/sku to be null", () => {
    const errors = validateCreateFurnitureProductInput(
      validInput({ material: null, color: null, dimensions: null, sku: null })
    );
    expect(errors).toEqual({});
  });

  it("rejects an overlong optional text field", () => {
    const errors = validateCreateFurnitureProductInput(validInput({ material: "x".repeat(201) }));
    expect(errors.material).toBeDefined();
  });

  it("rejects a description over the max length", () => {
    const errors = validateCreateFurnitureProductInput(validInput({ description: "x".repeat(5001) }));
    expect(errors.description).toBeDefined();
  });
});

describe("validateUpdateFurnitureProductInput", () => {
  it("returns no errors for an empty patch (nothing to validate)", () => {
    expect(validateUpdateFurnitureProductInput({})).toEqual({});
  });

  it("only validates fields that are actually present", () => {
    const errors = validateUpdateFurnitureProductInput({ price: 100 });
    expect(errors).toEqual({});
  });

  it("still rejects an invalid supplied price", () => {
    const errors = validateUpdateFurnitureProductInput({ price: -5 });
    expect(errors.price).toBeDefined();
  });

  it("still rejects an empty supplied name", () => {
    const errors = validateUpdateFurnitureProductInput({ name: "" });
    expect(errors.name).toBeDefined();
  });
});

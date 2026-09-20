import { isFurnitureCategory, isFurnitureCondition, isFurnitureStatus } from "./furniture-product";
import type { FurnitureFieldErrors } from "./errors";
import type { CreateFurnitureProductInput, UpdateFurnitureProductInput } from "./furniture-product-input";

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_TEXT_FIELD_LENGTH = 200;

function validatePrice(price: number): string | undefined {
  if (!Number.isFinite(price) || price <= 0) {
    return "Enter a valid price greater than zero.";
  }
  return undefined;
}

function validateTextField(value: string | null | undefined, label: string): string | undefined {
  if (value != null && value.length > MAX_TEXT_FIELD_LENGTH) {
    return `${label} must be ${MAX_TEXT_FIELD_LENGTH} characters or fewer.`;
  }
  return undefined;
}

/** Full validation — every required field is checked (used on create). */
export function validateCreateFurnitureProductInput(
  input: CreateFurnitureProductInput
): FurnitureFieldErrors {
  const errors: FurnitureFieldErrors = {};

  if (!input.name.trim()) {
    errors.name = "Name is required.";
  } else if (input.name.trim().length > MAX_NAME_LENGTH) {
    errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  if (input.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  if (!isFurnitureCategory(input.category)) {
    errors.category = "Select a valid category.";
  }

  if (!isFurnitureCondition(input.condition)) {
    errors.condition = "Select a valid condition.";
  }

  if (!isFurnitureStatus(input.status)) {
    errors.status = "Select a valid availability.";
  }

  const priceError = validatePrice(input.price);
  if (priceError) errors.price = priceError;

  if (!input.currency.trim()) errors.currency = "Currency is required.";

  const materialError = validateTextField(input.material, "Material");
  if (materialError) errors.material = materialError;

  const colorError = validateTextField(input.color, "Color");
  if (colorError) errors.color = colorError;

  const dimensionsError = validateTextField(input.dimensions, "Dimensions");
  if (dimensionsError) errors.dimensions = dimensionsError;

  const skuError = validateTextField(input.sku, "SKU");
  if (skuError) errors.sku = skuError;

  return errors;
}

/** Partial validation — only supplied fields are checked (used on update). */
export function validateUpdateFurnitureProductInput(
  input: UpdateFurnitureProductInput
): FurnitureFieldErrors {
  const errors: FurnitureFieldErrors = {};

  if (input.name !== undefined) {
    if (!input.name.trim()) errors.name = "Name is required.";
    else if (input.name.trim().length > MAX_NAME_LENGTH) {
      errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
    }
  }

  if (input.description !== undefined && input.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  if (input.category !== undefined && !isFurnitureCategory(input.category)) {
    errors.category = "Select a valid category.";
  }

  if (input.condition !== undefined && !isFurnitureCondition(input.condition)) {
    errors.condition = "Select a valid condition.";
  }

  if (input.status !== undefined && !isFurnitureStatus(input.status)) {
    errors.status = "Select a valid availability.";
  }

  if (input.price !== undefined) {
    const priceError = validatePrice(input.price);
    if (priceError) errors.price = priceError;
  }

  if (input.currency !== undefined && !input.currency.trim()) {
    errors.currency = "Currency is required.";
  }

  if (input.material !== undefined) {
    const materialError = validateTextField(input.material, "Material");
    if (materialError) errors.material = materialError;
  }
  if (input.color !== undefined) {
    const colorError = validateTextField(input.color, "Color");
    if (colorError) errors.color = colorError;
  }
  if (input.dimensions !== undefined) {
    const dimensionsError = validateTextField(input.dimensions, "Dimensions");
    if (dimensionsError) errors.dimensions = dimensionsError;
  }
  if (input.sku !== undefined) {
    const skuError = validateTextField(input.sku, "SKU");
    if (skuError) errors.sku = skuError;
  }

  return errors;
}

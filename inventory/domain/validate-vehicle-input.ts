import type { VehicleFieldErrors } from "./errors";
import type { CreateVehicleInput, UpdateVehicleInput } from "./vehicle-input";

const CURRENT_YEAR = new Date().getFullYear();

function validateYear(year: number): string | undefined {
  if (!Number.isInteger(year) || year < 1980 || year > CURRENT_YEAR + 1) {
    return `Enter a year between 1980 and ${CURRENT_YEAR + 1}.`;
  }
  return undefined;
}

function validateMileage(mileage: number): string | undefined {
  if (!Number.isFinite(mileage) || mileage < 0) {
    return "Mileage must be zero or a positive number.";
  }
  return undefined;
}

function validatePrice(price: number): string | undefined {
  if (!Number.isFinite(price) || price <= 0) {
    return "Enter a valid price greater than zero.";
  }
  return undefined;
}

/** Full validation — every field is required (used on create). */
export function validateCreateVehicleInput(
  input: CreateVehicleInput
): VehicleFieldErrors {
  const errors: VehicleFieldErrors = {};

  if (!input.make.trim()) errors.make = "Make is required.";
  if (!input.model.trim()) errors.model = "Model is required.";
  if (!input.stockId.trim()) errors.stockId = "Stock ID is required.";

  const yearError = validateYear(input.year);
  if (yearError) errors.year = yearError;

  const mileageError = validateMileage(input.mileage);
  if (mileageError) errors.mileage = mileageError;

  const priceError = validatePrice(input.price);
  if (priceError) errors.price = priceError;

  return errors;
}

/** Partial validation — only supplied fields are checked (used on update). */
export function validateUpdateVehicleInput(
  input: UpdateVehicleInput
): VehicleFieldErrors {
  const errors: VehicleFieldErrors = {};

  if (input.make !== undefined && !input.make.trim()) {
    errors.make = "Make is required.";
  }
  if (input.model !== undefined && !input.model.trim()) {
    errors.model = "Model is required.";
  }
  if (input.stockId !== undefined && !input.stockId.trim()) {
    errors.stockId = "Stock ID is required.";
  }
  if (input.year !== undefined) {
    const yearError = validateYear(input.year);
    if (yearError) errors.year = yearError;
  }
  if (input.mileage !== undefined) {
    const mileageError = validateMileage(input.mileage);
    if (mileageError) errors.mileage = mileageError;
  }
  if (input.price !== undefined) {
    const priceError = validatePrice(input.price);
    if (priceError) errors.price = priceError;
  }

  return errors;
}

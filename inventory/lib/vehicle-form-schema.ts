import type { Vehicle, VehicleStatus } from "../data/types";
import { validateCreateVehicleInput } from "../domain/validate-vehicle-input";
import type { CreateVehicleInput } from "../domain/vehicle-input";

export type VehicleFormValues = {
  make: string;
  model: string;
  year: string;
  stockId: string;
  mileage: string;
  price: string;
  status: VehicleStatus;
  description: string;
};

export type VehicleFormErrors = Partial<Record<keyof VehicleFormValues, string>>;

export const EMPTY_FORM_VALUES: VehicleFormValues = {
  make: "",
  model: "",
  year: "",
  stockId: "",
  mileage: "",
  price: "",
  status: "available",
  description: "",
};

export function getInitialFormValues(vehicle?: Vehicle): VehicleFormValues {
  if (!vehicle) return EMPTY_FORM_VALUES;

  return {
    make: vehicle.make,
    model: vehicle.model,
    year: String(vehicle.year),
    stockId: vehicle.stockId,
    mileage: String(vehicle.mileage),
    price: String(vehicle.price),
    status: vehicle.status,
    description: vehicle.description,
  };
}

/** Converts raw (string) form values into typed domain input. */
export function toCreateVehicleInput(
  values: VehicleFormValues
): CreateVehicleInput {
  return {
    make: values.make.trim(),
    model: values.model.trim(),
    year: Number(values.year),
    stockId: values.stockId.trim(),
    mileage: Number(values.mileage),
    price: Number(values.price),
    status: values.status,
    description: values.description.trim(),
  };
}

/**
 * UI-layer validation for immediate inline feedback. Delegates the
 * shared numeric/required rules to the domain validator so the two
 * layers can't drift apart — this just adds friendlier "required"
 * wording for fields that are empty strings (which the domain
 * validator, working on already-parsed numbers, can't distinguish
 * from a real 0).
 */
export function validateVehicleForm(
  values: VehicleFormValues
): VehicleFormErrors {
  const errors: VehicleFormErrors = {
    ...validateCreateVehicleInput(toCreateVehicleInput(values)),
  };

  if (!values.year.trim()) errors.year = "Year is required.";
  if (!values.mileage.trim()) errors.mileage = "Mileage is required.";
  if (!values.price.trim()) errors.price = "Price is required.";

  return errors;
}

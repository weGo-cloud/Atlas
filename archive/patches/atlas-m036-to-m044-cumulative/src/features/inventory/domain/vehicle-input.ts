import type { VehicleStatus } from "../data/types";

/** Typed, already-parsed input for creating a vehicle — the service/repository boundary. */
export type CreateVehicleInput = {
  make: string;
  model: string;
  year: number;
  stockId: string;
  mileage: number;
  price: number;
  status: VehicleStatus;
  description: string;
};

/** Partial update — only supplied fields are changed. */
export type UpdateVehicleInput = Partial<CreateVehicleInput>;

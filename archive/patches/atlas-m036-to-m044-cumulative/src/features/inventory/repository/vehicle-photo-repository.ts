import type { VehiclePhoto } from "../domain/vehicle-photo";

export interface VehiclePhotoRepository {
  listByVehicleId(vehicleId: string): Promise<VehiclePhoto[]>;
  /** One batched lookup for many vehicles — used by inventory list views to avoid N+1 queries. */
  listPrimaryForVehicleIds(
    vehicleIds: string[]
  ): Promise<Map<string, VehiclePhoto>>;
  getById(id: string): Promise<VehiclePhoto | null>;
  countByVehicleId(vehicleId: string): Promise<number>;
  add(input: { vehicleId: string; url: string }): Promise<VehiclePhoto>;
  /** Returns false if no photo existed with the given id. */
  remove(id: string): Promise<boolean>;
  /** Applies the given display order to a vehicle's photos. */
  reorder(vehicleId: string, orderedIds: string[]): Promise<VehiclePhoto[]>;
  /** Makes the given photo primary and un-primaries all of the vehicle's other photos. */
  setPrimary(vehicleId: string, photoId: string): Promise<VehiclePhoto[]>;
}

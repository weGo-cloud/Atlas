import { DatabaseVehicleRepository } from "../repository/database-vehicle-repository";
import { DatabaseVehiclePhotoRepository } from "../repository/database-vehicle-photo-repository";
import { VehicleService } from "./vehicle-service";
import { VehiclePhotoService } from "./vehicle-photo-service";

/**
 * Mission 012: these are now factory functions, not singletons — a
 * VehicleService/VehiclePhotoService is scoped to one business's data
 * for the lifetime of a single request, never shared across requests
 * for different businesses. Repositories are stateless (they just
 * call the shared `db` client on every method), so constructing fresh
 * ones per call is cheap; what matters is that every read/write this
 * mission touches goes through an instance that knows which business
 * it's allowed to see.
 *
 * vehicle_photos has no businessId column at all — photo ownership is
 * inherited entirely through the vehicle (see schema.ts) enforced
 * purely by wiring discipline: VehiclePhotoService always receives a
 * business-scoped VehicleRepository, so its existing "vehicle must
 * exist" checks already reject cross-business photo access with zero
 * code changes to that feature.
 */
export function getVehicleService(businessId: string): VehicleService {
  const vehicleRepository = new DatabaseVehicleRepository(businessId);
  const vehiclePhotoRepository = new DatabaseVehiclePhotoRepository();
  return new VehicleService(vehicleRepository, vehiclePhotoRepository);
}

export function getVehiclePhotoService(businessId: string): VehiclePhotoService {
  const vehicleRepository = new DatabaseVehicleRepository(businessId);
  const vehiclePhotoRepository = new DatabaseVehiclePhotoRepository();
  return new VehiclePhotoService(vehiclePhotoRepository, vehicleRepository);
}

export { VehicleService };
export { VehiclePhotoService };

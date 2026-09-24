export type VehicleStatus = "available" | "reserved" | "sold";

export type Vehicle = {
  id: string;
  /** Mission 012 — which business owns this listing. */
  businessId: string;
  stockId: string;
  make: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  status: VehicleStatus;
  addedAt: string;
  /** ISO timestamp of the last update. Set by the repository on write. */
  updatedAt: string;
  /** Development-only listing copy, shown on the vehicle detail page. */
  description: string;
};

export const VEHICLE_STATUSES: VehicleStatus[] = [
  "available",
  "reserved",
  "sold",
];

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { vehiclePhotos, type VehiclePhotoRow } from "@/lib/db/schema";
import type { VehiclePhoto } from "../domain/vehicle-photo";
import type { VehiclePhotoRepository } from "./vehicle-photo-repository";

export class DatabaseVehiclePhotoRepository implements VehiclePhotoRepository {
  async listByVehicleId(vehicleId: string): Promise<VehiclePhoto[]> {
    const rows = await db
      .select()
      .from(vehiclePhotos)
      .where(eq(vehiclePhotos.vehicleId, vehicleId))
      .orderBy(asc(vehiclePhotos.position));
    return rows.map(toPhoto);
  }

  async listPrimaryForVehicleIds(
    vehicleIds: string[]
  ): Promise<Map<string, VehiclePhoto>> {
    if (vehicleIds.length === 0) return new Map();

    const rows = await db
      .select()
      .from(vehiclePhotos)
      .where(
        and(
          inArray(vehiclePhotos.vehicleId, vehicleIds),
          eq(vehiclePhotos.isPrimary, true)
        )
      );

    const map = new Map<string, VehiclePhoto>();
    for (const row of rows) map.set(row.vehicleId, toPhoto(row));
    return map;
  }

  async getById(id: string): Promise<VehiclePhoto | null> {
    const rows = await db
      .select()
      .from(vehiclePhotos)
      .where(eq(vehiclePhotos.id, id))
      .limit(1);
    return rows[0] ? toPhoto(rows[0]) : null;
  }

  async countByVehicleId(vehicleId: string): Promise<number> {
    const rows = await db
      .select()
      .from(vehiclePhotos)
      .where(eq(vehiclePhotos.vehicleId, vehicleId));
    return rows.length;
  }

  async add(input: { vehicleId: string; url: string }): Promise<VehiclePhoto> {
    const existing = await this.listByVehicleId(input.vehicleId);
    const id = generateId();
    // The first photo for a vehicle becomes primary by default; every
    // photo after that stays non-primary until setPrimary is called.
    const isPrimary = existing.length === 0;

    await db.insert(vehiclePhotos).values({
      id,
      vehicleId: input.vehicleId,
      url: input.url,
      position: existing.length,
      isPrimary,
      createdAt: new Date().toISOString(),
    });

    const created = await this.getById(id);
    if (!created) {
      throw new Error("Failed to read back newly created photo.");
    }
    return created;
  }

  async remove(id: string): Promise<boolean> {
    const photo = await this.getById(id);
    if (!photo) return false;

    await db.delete(vehiclePhotos).where(eq(vehiclePhotos.id, id));

    // Removing the primary photo promotes the next one in display
    // order, so a vehicle with remaining photos never ends up with
    // none marked primary.
    if (photo.isPrimary) {
      const remaining = await this.listByVehicleId(photo.vehicleId);
      const next = remaining[0];
      if (next) {
        await db
          .update(vehiclePhotos)
          .set({ isPrimary: true })
          .where(eq(vehiclePhotos.id, next.id));
      }
    }

    return true;
  }

  async reorder(
    vehicleId: string,
    orderedIds: string[]
  ): Promise<VehiclePhoto[]> {
    const existing = await this.listByVehicleId(vehicleId);
    const existingIds = new Set(existing.map((photo) => photo.id));

    // Ignore any id that doesn't belong to this vehicle rather than
    // erroring — keeps this operation safe against a stale client
    // sending an order list that no longer matches the server state.
    const validOrderedIds = orderedIds.filter((id) => existingIds.has(id));

    for (let index = 0; index < validOrderedIds.length; index++) {
      await db
        .update(vehiclePhotos)
        .set({ position: index })
        .where(eq(vehiclePhotos.id, validOrderedIds[index]));
    }

    return this.listByVehicleId(vehicleId);
  }

  async setPrimary(
    vehicleId: string,
    photoId: string
  ): Promise<VehiclePhoto[]> {
    const existing = await this.listByVehicleId(vehicleId);
    if (!existing.some((photo) => photo.id === photoId)) {
      return existing;
    }

    for (const photo of existing) {
      const shouldBePrimary = photo.id === photoId;
      if (photo.isPrimary !== shouldBePrimary) {
        await db
          .update(vehiclePhotos)
          .set({ isPrimary: shouldBePrimary })
          .where(eq(vehiclePhotos.id, photo.id));
      }
    }

    return this.listByVehicleId(vehicleId);
  }
}

function toPhoto(row: VehiclePhotoRow): VehiclePhoto {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    url: row.url,
    position: row.position,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `photo_${Date.now().toString(36)}${counter.toString(36)}`;
}

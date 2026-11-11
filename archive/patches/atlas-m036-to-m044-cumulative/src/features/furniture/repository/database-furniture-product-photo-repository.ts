import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { furnitureProductPhotos, type FurnitureProductPhotoRow } from "@/lib/db/schema";
import type { FurnitureProductPhoto } from "../domain/furniture-product-photo";
import type { FurnitureProductPhotoRepository } from "./furniture-product-photo-repository";

export class DatabaseFurnitureProductPhotoRepository implements FurnitureProductPhotoRepository {
  async listByProductId(productId: string): Promise<FurnitureProductPhoto[]> {
    const rows = await db
      .select()
      .from(furnitureProductPhotos)
      .where(eq(furnitureProductPhotos.furnitureProductId, productId))
      .orderBy(asc(furnitureProductPhotos.position));
    return rows.map(toPhoto);
  }

  async listPrimaryForProductIds(productIds: string[]): Promise<Map<string, FurnitureProductPhoto>> {
    if (productIds.length === 0) return new Map();

    const rows = await db
      .select()
      .from(furnitureProductPhotos)
      .where(
        and(
          inArray(furnitureProductPhotos.furnitureProductId, productIds),
          eq(furnitureProductPhotos.isPrimary, true)
        )
      );

    const map = new Map<string, FurnitureProductPhoto>();
    for (const row of rows) map.set(row.furnitureProductId, toPhoto(row));
    return map;
  }

  async getById(id: string): Promise<FurnitureProductPhoto | null> {
    const rows = await db.select().from(furnitureProductPhotos).where(eq(furnitureProductPhotos.id, id)).limit(1);
    return rows[0] ? toPhoto(rows[0]) : null;
  }

  async countByProductId(productId: string): Promise<number> {
    const rows = await db
      .select()
      .from(furnitureProductPhotos)
      .where(eq(furnitureProductPhotos.furnitureProductId, productId));
    return rows.length;
  }

  async add(input: { furnitureProductId: string; url: string }): Promise<FurnitureProductPhoto> {
    const existing = await this.listByProductId(input.furnitureProductId);
    const id = generateId();
    const isPrimary = existing.length === 0;

    await db.insert(furnitureProductPhotos).values({
      id,
      furnitureProductId: input.furnitureProductId,
      url: input.url,
      position: existing.length,
      isPrimary,
      createdAt: new Date().toISOString(),
    });

    const created = await this.getById(id);
    if (!created) throw new Error("Failed to read back newly created photo.");
    return created;
  }

  async remove(id: string): Promise<boolean> {
    const photo = await this.getById(id);
    if (!photo) return false;

    await db.delete(furnitureProductPhotos).where(eq(furnitureProductPhotos.id, id));

    if (photo.isPrimary) {
      const remaining = await this.listByProductId(photo.furnitureProductId);
      const next = remaining[0];
      if (next) {
        await db.update(furnitureProductPhotos).set({ isPrimary: true }).where(eq(furnitureProductPhotos.id, next.id));
      }
    }

    return true;
  }

  async reorder(productId: string, orderedIds: string[]): Promise<FurnitureProductPhoto[]> {
    const existing = await this.listByProductId(productId);
    const existingIds = new Set(existing.map((photo) => photo.id));
    const validOrderedIds = orderedIds.filter((id) => existingIds.has(id));

    for (let index = 0; index < validOrderedIds.length; index++) {
      await db.update(furnitureProductPhotos).set({ position: index }).where(eq(furnitureProductPhotos.id, validOrderedIds[index]));
    }

    return this.listByProductId(productId);
  }

  async setPrimary(productId: string, photoId: string): Promise<FurnitureProductPhoto[]> {
    const existing = await this.listByProductId(productId);
    if (!existing.some((photo) => photo.id === photoId)) return existing;

    for (const photo of existing) {
      const shouldBePrimary = photo.id === photoId;
      if (photo.isPrimary !== shouldBePrimary) {
        await db.update(furnitureProductPhotos).set({ isPrimary: shouldBePrimary }).where(eq(furnitureProductPhotos.id, photo.id));
      }
    }

    return this.listByProductId(productId);
  }
}

function toPhoto(row: FurnitureProductPhotoRow): FurnitureProductPhoto {
  return {
    id: row.id,
    furnitureProductId: row.furnitureProductId,
    url: row.url,
    position: row.position,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `fphoto_${Date.now().toString(36)}${counter.toString(36)}`;
}
